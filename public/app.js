import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm'
import { WebsocketProvider } from 'https://cdn.jsdelivr.net/npm/y-websocket@1.5.4/+esm'
import { QuillBinding } from 'https://cdn.jsdelivr.net/npm/y-quill@0.1.5/+esm'

const homeView = document.getElementById('homeView')
const editorView = document.getElementById('editorView')
const statusNode = document.getElementById('status')
const participantsNode = document.getElementById('participants')
const docListNode = document.getElementById('docList')
const createBtn = document.getElementById('createBtn')
const joinBtn = document.getElementById('joinBtn')
const titleInput = document.getElementById('titleInput')
const usernameInput = document.getElementById('username')
const shareCodeInput = document.getElementById('shareCodeInput')
const docTitleNode = document.getElementById('docTitle')
const shareCodeBadge = document.getElementById('shareCodeBadge')
const copyShareCodeBtn = document.getElementById('copyShareCodeBtn')
const exportBtn = document.getElementById('exportBtn')
const backHomeBtn = document.getElementById('backHomeBtn')
const homeMessage = document.getElementById('homeMessage')

let provider
let doc
let binding
let currentDocId
let currentShareCode = ''

const randomName = () => `用户${Math.floor(Math.random() * 9000 + 1000)}`
usernameInput.value = localStorage.getItem('editor-name') || randomName()

const quill = new Quill('#editor', {
  modules: {
    toolbar: '#toolbar'
  },
  theme: 'snow',
  placeholder: '开始和你的团队一起编辑...'
})

function setHomeMessage(text, isError = false) {
  homeMessage.textContent = text
  homeMessage.style.color = isError ? '#d1242f' : '#1f6feb'
}

function showEditorView() {
  homeView.classList.add('hidden')
  editorView.classList.remove('hidden')
}

function showHomeView() {
  editorView.classList.add('hidden')
  homeView.classList.remove('hidden')
}

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

function disconnect() {
  if (provider) {
    binding.destroy()
    provider.destroy()
    doc.destroy()
    provider = undefined
    doc = undefined
    binding = undefined
  }
}

function connect(docId, title, shareCode) {
  disconnect()

  currentDocId = docId
  currentShareCode = shareCode || ''
  docTitleNode.textContent = title
  shareCodeBadge.textContent = `分享码：${currentShareCode || '-'}`

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
    button.textContent = `${docItem.title}（${docItem.share_code}）`
    button.className = currentDocId === docItem.document_id ? 'doc-item active' : 'doc-item'
    button.addEventListener('click', () => connect(docItem.document_id, docItem.title, docItem.share_code))

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
  if (!response.ok) {
    setHomeMessage(data.message || '创建失败', true)
    return
  }

  titleInput.value = ''
  setHomeMessage(`文档已创建，分享码：${data.shareCode}`)
  await bootstrap(data.documentId)
  showEditorView()
}

async function joinByShareCode() {
  const shareCode = shareCodeInput.value.trim().toUpperCase()
  if (!shareCode) {
    setHomeMessage('请输入分享码', true)
    return
  }

  const response = await fetch('/api/documents/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareCode })
  })

  const data = await response.json()
  if (!response.ok) {
    setHomeMessage(data.message || '加入失败', true)
    return
  }

  shareCodeInput.value = ''
  setHomeMessage(`已加入文档：${data.title}`)
  await bootstrap(data.documentId)
  showEditorView()
}

async function bootstrap(preferredDocId) {
  const documents = await fetchDocuments()
  if (!documents.length) return

  renderDocuments(documents)

  const selectedId = Number(preferredDocId || location.hash.replace('#', ''))
  const selected = documents.find((d) => d.document_id === selectedId) || documents[0]
  connect(selected.document_id, selected.title, selected.share_code)
  renderDocuments(documents)
}

function exportAsWord() {
  const content = quill.root.innerHTML
  const header = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>'
  const footer = '</body></html>'
  const source = `${header}${content}${footer}`

  const blob = new Blob(['\ufeff', source], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeTitle = (docTitleNode.textContent || '协作文档').replace(/[\\/:*?"<>|]/g, '_')
  a.href = url
  a.download = `${safeTitle}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

createBtn.addEventListener('click', createDocument)
joinBtn.addEventListener('click', joinByShareCode)
exportBtn.addEventListener('click', exportAsWord)

copyShareCodeBtn.addEventListener('click', async () => {
  if (!currentShareCode) return
  await navigator.clipboard.writeText(currentShareCode)
  shareCodeBadge.textContent = `分享码：${currentShareCode}（已复制）`
})

backHomeBtn.addEventListener('click', () => {
  disconnect()
  showHomeView()
})

usernameInput.addEventListener('change', () => {
  localStorage.setItem('editor-name', usernameInput.value)
  if (provider) provider.awareness.setLocalStateField('user', myUser())
})

showHomeView()
bootstrap(Number(location.hash.replace('#', '')) || undefined)
