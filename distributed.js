const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const { performance } = require('perf_hooks')

const _ = require('lodash')
const axios = require('axios')
const express = require('express')

const {
  TARGET_HOST,
  TARGET_PORT,
  HOSTNAME,
  WEBHOOK_PORT,
  DATA_DIR,
  BATCH_REQUESTS = 500,
  BATCH_TIMEFRAME = 5000,
  BATCH_TIMEOUT = 10000
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

function makeCall (id) {
  const callStats = {
    ts: Math.floor(Date.now()),
    initial: performance.now()
  }

  const url = `http://${TARGET_HOST}:${TARGET_PORT}/${HOSTNAME}/${WEBHOOK_PORT}/${id}`

  return wait(BATCH_TIMEFRAME * Math.random())
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
      const expectedRequest = axios.get(url)
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
        wait(BATCH_TIMEOUT)
      ])
    })
    .then(() => {
      return callStats
    })
}

async function main () {
  while (true) {
    const bulkId = `${+Date.now()}-${HOSTNAME}`
    const marks = await runBulk(BATCH_REQUESTS, async id => {
      return await makeCall(`${bulkId}-${id}`)
    }).then(marks => marks.map(m => m.value))

    const fh = await fs.open(path.join(DATA_DIR, `${bulkId}.json`), 'wx')

    await fh.writeFile(JSON.stringify(marks), 'utf8')

    await fh.close()
  }
}

main()
  .catch(e => {
    console.error(e)
  })
  .then(() => {
    server.close()
    console.info('exiting')
  })
