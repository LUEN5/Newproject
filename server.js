const http = require('http')
const express = require('express')
const WebSocket = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const app = express()
app.use(express.static('public'))

app.get('/health', (_, res) => {
  res.json({ ok: true })
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request)
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Collaborative editor is running on http://localhost:${PORT}`)
})
