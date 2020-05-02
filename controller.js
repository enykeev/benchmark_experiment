const crypto = require('crypto')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')

const WebSocket = require('ws')

const wss = new WebSocket.Server({ port: 8080 })

const {
  TARGET_HOST,
  TARGET_PORT,
  DATA_DIR,
  BATCH_SIZE = 500,
  BATCH_WINDOW = 5000,
  BATCH_TIMEOUT = 10000
} = process.env

const state = {
  state: 'running',
  batchSize: BATCH_SIZE,
  batchWindow: BATCH_WINDOW,
  batchTimeout: BATCH_TIMEOUT
}

wss.on('connection', ws => {
  const workerId = crypto.randomBytes(8).toString('hex')

  function requestBatch () {
    const url = `http://${TARGET_HOST}:${TARGET_PORT}/`

    ws.send(JSON.stringify({
      ...state,
      batchId: `${+Date.now()}-${workerId}`,
      request: {
        method: 'GET',
        url
      }
    }))
  }

  ws.on('message', async message => {
    const fh = await fs.open(path.join(DATA_DIR, `${+Date.now()}-${workerId}.json`), 'wx')
    await fh.writeFile(message, 'utf8')
    await fh.close()
  })

  requestBatch()
})
