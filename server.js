const fs = require('fs')
const path = require('path')
const http = require('http')
const express = require('express')
const WebSocket = require('ws')
const Y = require('yjs')
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')

const app = express()
app.use(express.json())
app.use(express.static('public'))

const dataDir = path.join(__dirname, 'data')
const dbPath = path.join(dataDir, 'db.json')
fs.mkdirSync(dataDir, { recursive: true })

const createInitialDb = () => ({
  users: [],
  documents: [],
  document_updates: [],
  version_history: []
})

const loadDb = () => {
  if (!fs.existsSync(dbPath)) {
    const initial = createInitialDb()
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2))
    return initial
  }

  const raw = fs.readFileSync(dbPath, 'utf8')
  return raw ? JSON.parse(raw) : createInitialDb()
}

const saveDb = (db) => {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2))
}

const now = () => new Date().toISOString()
const nextId = (rows, idField) => rows.reduce((max, row) => Math.max(max, row[idField]), 0) + 1
const randomShareCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()

const ensureShareCode = (db) => {
  db.documents.forEach((doc) => {
    if (!doc.share_code) {
      let code = randomShareCode()
      const used = new Set(db.documents.map((item) => item.share_code).filter(Boolean))
      while (used.has(code)) code = randomShareCode()
      doc.share_code = code
    }
  })
}

const createUniqueShareCode = (db) => {
  const used = new Set(db.documents.map((doc) => doc.share_code).filter(Boolean))
  let code = randomShareCode()
  while (used.has(code)) code = randomShareCode()
  return code
}

const ensureUser = (db, username) => {
  const existing = db.users.find((u) => u.username === username)
  if (existing) return existing

  const user = {
    user_id: nextId(db.users, 'user_id'),
    username,
    created_at: now()
  }
  db.users.push(user)
  return user
}

const getDocument = (db, id) => db.documents.find((doc) => doc.document_id === id && doc.is_deleted === 0)

app.get('/health', (_, res) => {
  res.json({ ok: true })
})

app.get('/api/documents', (_, res) => {
  const db = loadDb()
  ensureShareCode(db)
  saveDb(db)
  const documents = db.documents
    .filter((doc) => doc.is_deleted === 0)
    .map((doc) => {
      const creator = db.users.find((u) => u.user_id === doc.creator_id)
      return {
        document_id: doc.document_id,
        title: doc.title,
        share_code: doc.share_code,
        updated_at: doc.updated_at,
        creator_name: creator?.username || 'anonymous'
      }
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  res.json({ documents })
})

app.post('/api/documents', (req, res) => {
  const db = loadDb()
  ensureShareCode(db)
  const title = (req.body?.title || '').trim() || '未命名文档'
  const ownerName = (req.body?.ownerName || '').trim() || 'anonymous'
  const owner = ensureUser(db, ownerName)

  const document = {
    document_id: nextId(db.documents, 'document_id'),
    title,
    creator_id: owner.user_id,
    share_code: createUniqueShareCode(db),
    created_at: now(),
    updated_at: now(),
    is_deleted: 0
  }

  db.documents.push(document)
  saveDb(db)

  res.status(201).json({
    documentId: document.document_id,
    title: document.title,
    shareCode: document.share_code
  })
})

app.post('/api/documents/join', (req, res) => {
  const db = loadDb()
  ensureShareCode(db)
  saveDb(db)

  const shareCode = (req.body?.shareCode || '').trim().toUpperCase()
  if (!shareCode) {
    res.status(400).json({ message: '请输入分享码' })
    return
  }

  const doc = db.documents.find((item) => item.share_code === shareCode && item.is_deleted === 0)
  if (!doc) {
    res.status(404).json({ message: '分享码无效或文档不存在' })
    return
  }

  res.json({
    documentId: doc.document_id,
    title: doc.title,
    shareCode: doc.share_code
  })
})

app.get('/api/documents/:id', (req, res) => {
  const db = loadDb()
  ensureShareCode(db)
  saveDb(db)
  const doc = getDocument(db, Number(req.params.id))

  if (!doc) {
    res.status(404).json({ message: '文档不存在' })
    return
  }

  res.json({ document: doc })
})

app.get('/api/documents/:id/versions', (req, res) => {
  const db = loadDb()
  const id = Number(req.params.id)

  const versions = db.version_history
    .filter((v) => v.document_id === id)
    .sort((a, b) => b.version_number - a.version_number)
    .slice(0, 20)

  res.json({ versions })
})

setPersistence({
  bindState: (docName, ydoc) => {
    const docId = Number(docName.replace('doc-', ''))
    const db = loadDb()

    db.document_updates
      .filter((row) => row.document_id === docId)
      .sort((a, b) => a.update_id - b.update_id)
      .forEach((row) => {
        Y.applyUpdate(ydoc, Buffer.from(row.update_blob, 'base64'))
      })

    ydoc.on('update', (update) => {
      const refreshedDb = loadDb()
      refreshedDb.document_updates.push({
        update_id: nextId(refreshedDb.document_updates, 'update_id'),
        document_id: docId,
        update_blob: Buffer.from(update).toString('base64'),
        created_at: now()
      })

      const targetDoc = getDocument(refreshedDb, docId)
      if (targetDoc) targetDoc.updated_at = now()
      saveDb(refreshedDb)
    })
  },
  writeState: (docName, ydoc) => {
    const docId = Number(docName.replace('doc-', ''))
    const db = loadDb()
    const latestVersion = db.version_history
      .filter((v) => v.document_id === docId)
      .reduce((max, v) => Math.max(max, v.version_number), 0)

    db.version_history.push({
      version_id: nextId(db.version_history, 'version_id'),
      document_id: docId,
      version_number: latestVersion + 1,
      content_snapshot: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'),
      created_at: now(),
      change_log: '自动快照'
    })

    saveDb(db)
  }
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const docId = Number(url.searchParams.get('docId'))
  const db = loadDb()

  if (!docId || !getDocument(db, docId)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request, { docName: `doc-${docId}` })
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Collaborative editor is running on http://localhost:${PORT}`)
})
