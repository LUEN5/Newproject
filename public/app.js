import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.18/+esm'
import { WebsocketProvider } from 'https://cdn.jsdelivr.net/npm/y-websocket@1.5.4/+esm'
import { QuillBinding } from 'https://cdn.jsdelivr.net/npm/y-quill@0.1.5/+esm'

const statusNode = document.getElementById('status')
const participantsNode = document.getElementById('participants')
const roomInput = document.getElementById('room')

let provider
let doc
let binding

const randomName = () => `用户${Math.floor(Math.random() * 9000 + 1000)}`
const me = {
  name: randomName(),
  color: `hsl(${Math.floor(Math.random() * 360)} 75% 50%)`
}

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

function connect(roomName) {
  if (provider) {
    provider.destroy()
    doc.destroy()
  }

  doc = new Y.Doc()
  provider = new WebsocketProvider(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`, roomName, doc)
  const ytext = doc.getText('quill')

  provider.awareness.setLocalStateField('user', me)

  binding = new QuillBinding(ytext, quill, provider.awareness)

  provider.on('status', ({ status }) => {
    statusNode.textContent = status === 'connected' ? `已连接（${roomName}）` : '断开连接'
  })

  provider.awareness.on('change', () => refreshParticipants(provider.awareness))
  refreshParticipants(provider.awareness)
}

const initialRoom = location.hash.replace('#', '') || 'default-room'
roomInput.value = initialRoom
connect(initialRoom)

roomInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return

  const value = roomInput.value.trim()
  if (!value) return

  location.hash = value
  connect(value)
})
