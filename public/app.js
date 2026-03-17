import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm'
import { WebsocketProvider } from 'https://cdn.jsdelivr.net/npm/y-websocket@1.5.4/+esm'
import { QuillBinding } from 'https://cdn.jsdelivr.net/npm/y-quill@0.1.5/+esm'

const statusNode = document.getElementById('status')
const participantsNode = document.getElementById('participants')
const docListNode = document.getElementById('docList')
const createBtn = document.getElementById('createBtn')
const titleInput = document.getElementById('titleInput')
const usernameInput = document.getElementById('username')
const docTitleNode = document.getElementById('docTitle')

let provider
let doc
let binding
let currentDocId

const randomName = () => `用户${Math.floor(Math.random() * 9000 + 1000)}`
usernameInput.value = localStorage.getItem('editor-name') || randomName()

const quill = new Quill('#editor', {
  modules: {
    toolbar: '#toolbar'
  },
  theme: 'snow',
  placeholder: '开始和你的团队一起编辑...'
})

function refreshParticipants(awareness) {
  const users = [...awareness.getStates().values()].map((state) => state.user?.name).filter(Boolean)
  participantsNode.textContent = users.length ? `在线用户：${users.join('、')}` : '暂无在线用户'
}

function myUser() {
  return {
    name: usernameInput.value.trim() || randomName(),
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 50%)`
  }
}

function connect(docId, title) {
  if (provider) {
    binding.destroy()
    provider.destroy()
    doc.destroy()
  }

  currentDocId = docId
  docTitleNode.textContent = title

  doc = new Y.Doc()
  provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}?docId=${docId}`, `doc-${docId}`, doc)
  const ytext = doc.getText('quill')

  provider.awareness.setLocalStateField('user', myUser())
  binding = new QuillBinding(ytext, quill, provider.awareness)

  provider.on('status', ({ status }) => {
    statusNode.textContent = status === 'connected' ? `已连接（文档 #${docId}）` : '断开连接'
  })

  provider.awareness.on('change', () => refreshParticipants(provider.awareness))
  refreshParticipants(provider.awareness)
  location.hash = String(docId)
}

async function fetchDocuments() {
  const response = await fetch('/api/documents')
  const data = await response.json()
  return data.documents
}

function renderDocuments(documents) {
  docListNode.innerHTML = ''

  documents.forEach((docItem) => {
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.textContent = docItem.title
    button.className = currentDocId === docItem.document_id ? 'doc-item active' : 'doc-item'
    button.addEventListener('click', () => connect(docItem.document_id, docItem.title))

    li.appendChild(button)
    docListNode.appendChild(li)
  })
}

async function createDocument() {
  const payload = {
    title: titleInput.value.trim() || '未命名文档',
    ownerName: usernameInput.value.trim() || 'anonymous'
  }

  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json()

  titleInput.value = ''
  await bootstrap(data.documentId)
}

async function bootstrap(preferredDocId) {
  const documents = await fetchDocuments()

  if (!documents.length) {
    await createDocument()
    return
  }

  renderDocuments(documents)

  const selectedId = Number(preferredDocId || location.hash.replace('#', ''))
  const selected = documents.find((d) => d.document_id === selectedId) || documents[0]
  connect(selected.document_id, selected.title)
  renderDocuments(documents)
}

createBtn.addEventListener('click', createDocument)

usernameInput.addEventListener('change', () => {
  localStorage.setItem('editor-name', usernameInput.value)
  if (provider) {
    provider.awareness.setLocalStateField('user', myUser())
  }
})

bootstrap()
