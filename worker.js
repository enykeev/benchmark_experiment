const { performance } = require('perf_hooks')

const _ = require('lodash')
const axios = require('axios')
const express = require('express')
const WebSocket = require('ws');

const {
  HOSTNAME,
  WEBHOOK_PORT
} = process.env


function wait (t) {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

function runBulk (num, fn) {
  const calls = _.range(num)
    .map(i => fn(i))
  return Promise.allSettled(calls)
}

const expectedWebhooks = {}
const app = express()

app.get(`/:id`, (req, res) => {
  const expectation = expectedWebhooks[req.params.id]
  if (expectation) {
    expectation()
  }
  res.send('ok')
})

const server = app.listen(WEBHOOK_PORT, () => {
  console.log('listening on port', WEBHOOK_PORT)
})

function makeCall (id, request, batchWindow, batchTimeout) {
  const callStats = {
    ts: Math.floor(Date.now()),
    initial: performance.now()
  }

  return wait(batchWindow * Math.random())
    .then(() => {
      callStats.start = performance.now()
      callStats.status = 'timeout'

      const expectedWebhook = new Promise(resolve => {
        expectedWebhooks[''+id] = () => {
          callStats.webhook = performance.now()
          delete expectedWebhooks[''+id]
          resolve()
        }
      })
      const expectedRequest = axios.request({
        ...request,
        url: request.url + `${HOSTNAME}/${WEBHOOK_PORT}/${id}`
      })
        .then(res => {
          callStats.status = 'success'
          callStats.response = performance.now()
        })
        .catch(e => {
          callStats.status = 'failure'
          callStats.response = performance.now()
        })

      return Promise.race([
        Promise.allSettled([expectedRequest, expectedWebhook]),
        wait(batchTimeout)
      ])
    })
    .then(() => {
      return callStats
    })
}

const ws = new WebSocket('ws://controller:8080');

async function main () {
  let currentState = {}

  ws.on('message', async data => {
    currentState = JSON.parse(data)
  })

  while (true) {
    const {
      state,
      batchId,
      request,
      batchSize,
      batchWindow,
      batchTimeout
    } = currentState

    console.log(state)

    if (state !== 'running') {
      await wait(100)
      continue
    }

    const marks = await runBulk(batchSize, async id => {
      return await makeCall(`${batchId}-${id}`, request, batchWindow, batchTimeout)
    }).then(marks => marks.map(m => m.value))

    ws.send(JSON.stringify(marks))
  }
}

main()
  .catch(e => {
    console.error(e)
  })
  .then(() => {
    //server.close()
    console.info('exiting')
  })
