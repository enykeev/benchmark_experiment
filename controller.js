const crypto = require('crypto')
const fs = require('fs/promises')
const http = require('http');
const os = require('os')
const path = require('path')

const _ = require('lodash')
const ss = require('simple-statistics')
const WebSocket = require('ws')

const server = http.createServer()
const wss = new WebSocket.Server({ noServer: true })

const {
  TARGET_HOST,
  TARGET_PORT,
  DATA_DIR,
  BATCH_SIZE = 500,
  BATCH_WINDOW = 5000,
  BATCH_TIMEOUT = 10000
} = process.env

function processMarks (marks) {
  return _.chain(marks)
    .map(m => {
      const origin = m.ts - m.initial

      const points = [{
        type: 'request',
        time: origin + m.start
      }, {
        type: m.status,
        time: origin + m.response
      }, {
        type: 'rtt',
        value: m.response - m.start,
        time: origin + m.response
      }]

      if (m.webhook) {
        points.push({
          type: 'webhook',
          time: origin + m.webhook
        }, {
          type: 'e2e',
          value: m.webhook - m.start,
          time: origin + m.webhook
        })
      }

      return points
    })
    .flattenDeep()
    .groupBy('type')
    .mapValues(v => {
      return _.map(v, i => _.omit(i, 'type'))
    })
    .value()
}

wss.on('connection', (ws, request) => {
  const workerId = crypto.randomBytes(8).toString('hex')
  ws.isUI = request.url == '/?type=ui'
  ws.isWorker = request.url == '/?type=worker'

  const defaultState = {
    type: 'state',
    state: 'running',
    batchSize: BATCH_SIZE,
    batchWindow: BATCH_WINDOW,
    batchTimeout: BATCH_TIMEOUT,
    batchId: `${+Date.now()}-${workerId}`,
    request: {
      method: 'GET',
      url: `http://${TARGET_HOST}:${TARGET_PORT}/`
    }
  }

  console.log('client connected:', ws.isUI)

  ws.on('message', async message => {
    message = JSON.parse(message)

    if (ws.isWorker) {
      const marks = processMarks(message)

      wss.clients.forEach(client => {
        if (client.isUI) {
          client.send(JSON.stringify({
            type: 'marks',
            marks
          }))
        }
      })
    }

    if (ws.isUI) {
      if (message.type === 'state') {
        wss.clients.forEach(client => {
          client.send(JSON.stringify({
            ...defaultState,
            ...message
          }))
        })
      }
    }
  })

  ws.send(JSON.stringify(defaultState))
})

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  })
})

server.listen(8080)
