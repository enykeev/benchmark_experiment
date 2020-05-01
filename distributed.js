const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const { performance } = require('perf_hooks')

const axios = require('axios')
const express = require('express')

const { TARGET_HOST, TARGET_PORT, HOSTNAME, WEBHOOK_PORT, DATA_DIR } = process.env


function wait (t) {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

function range (i) {
  return [...Array(i).keys()]
}

function runBulk (num, fn) {
  const calls = range(num)
    .map(i => fn(i))
  return Promise.allSettled(calls)
}

const app = express()
const server = app.listen(WEBHOOK_PORT, () => {
  console.log('listening on port', WEBHOOK_PORT)
})

function makeCall (id) {
  const callStats = {
    ts: Math.floor(Date.now()),
    start: performance.now(),
    status: 'timeout'
  }

  const expectedWebhook = new Promise(resolve => {
    app.get(`/${id}`, (req, res) => {
      callStats.webhook = performance.now()
      resolve()
      res.send('ok')
    })
  })
  const url = `http://${TARGET_HOST}:${TARGET_PORT}/${HOSTNAME}/${WEBHOOK_PORT}/${id}`
  const expectedRequest = axios.get(url)
    .then(res => {
      callStats.status = 'success'
      callStats.response = performance.now()
    })
    .catch(e => {
      callStats.status = 'failure'
      callStats.response = performance.now()
    })

  return Promise.race([Promise.allSettled([expectedRequest, expectedWebhook]), wait(10000)])
    .then(() => {
      return callStats
    })
}

async function main () {
  const bulkId = `${HOSTNAME}-${+Date.now()}`
  const marks = await runBulk(500, async id => {
    return await makeCall(id)
  }).then(marks => marks.map(m => m.value))

  const fh = await fs.open(path.join(DATA_DIR, `${bulkId}.json`), 'wx')

  await fh.writeFile(JSON.stringify(marks), 'utf8')

  await fh.close()
}

main()
  .catch(e => {
    console.error(e)
  })
  .then(() => {
    server.close()
    console.info('exiting')
  })
