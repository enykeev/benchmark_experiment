const os = require('os')
const { performance } = require('perf_hooks')

const axios = require('axios')
const express = require('express')
const ss = require('simple-statistics')

const groupBy = function (arr, criteria) {
  return arr.reduce(function (obj, item) {
    const key = typeof criteria === 'function' ? criteria(item) : item[criteria]
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      obj[key] = []
    }
    obj[key].push(item)
    return obj
  }, {})
}

function range (i) {
  return [...Array(i).keys()]
}

function wait (t) {
  return new Promise(resolve => {
    setTimeout(resolve, t)
  })
}

const { TARGET_HOST, TARGET_PORT, HOSTNAME, WEBHOOK_PORT } = process.env

let stopped

const app = express()
const server = app.listen(WEBHOOK_PORT, () => {
  console.log('listening on port', WEBHOOK_PORT)
})

function makeCall (id) {
  const callStats = {}
  callStats.start = performance.now()

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
      callStats.success = performance.now()
    })
    .catch(e => {
      callStats.error = performance.now()
    })

  return Promise.race([Promise.allSettled([expectedRequest, expectedWebhook]), wait(10000)])
    .then(() => {
      return callStats
    })
}

function runBulk (num, fn) {
  const calls = range(num)
    .map(i => fn(i))
  return Promise.allSettled(calls)
}

async function runBulkSeq (num, fn) {
  for (const id in range(num)) {
    await fn(+id)
  }
}

let prevCpus = os.cpus()

runBulkSeq(30, async bulk => {
  if (stopped) {
    return
  }

  const marks = await runBulk(1000, async id => {
    return await makeCall(bulk * 1000 + id)
  })

  function count (fn) {
    return (acc, i) => fn(i) ? acc + 1 : acc
  }

  function calcStats (fn) {
    return items => {
      const durations = items
        .map(fn)
        .filter(i => !Number.isNaN(i))

      if (!durations.length) {
        return {}
      }

      return {
        mean: ss.mean(durations),
        p5: ss.quantile(durations, 0.05),
        p50: ss.quantile(durations, 0.5),
        p95: ss.quantile(durations, 0.95),
        p99: ss.quantile(durations, 0.99)
      }
    }
  }

  function calcRate (fn) {
    return items => {
      const reqTimes = items.map(fn).filter(i => !Number.isNaN(i))
      const time = Math.max(...reqTimes) - Math.min(...reqTimes)

      return reqTimes.length / time
    }
  }

  const cpus = os.cpus()

  const aggregators = {
    total: items => items.reduce((acc, item) => acc + 1, 0),
    success: items => items
      .map(i => i.value.success)
      .reduce(count(i => !!i), 0),
    error: items => items
      .map(i => !!i.value.error)
      .reduce(count(i => !!i), 0),
    webhook: items => items
      .map(i => !!i.value.webhook)
      .reduce(count(i => !!i), 0),
    timeout: items => items
      .map(i => !i.value.success)
      .reduce(count(i => !!i), 0),
    timeToSuccess: calcStats(i => i.value.success - i.value.start),
    timeToError: calcStats(i => i.value.error - i.value.start),
    timeToWebhook: calcStats(i => i.value.webhook - i.value.start),
    requestPerSecond: calcRate(i => i.value.start / 1000),
    responsePerSecond: calcRate(i => i.value.success / 1000),
    webhooksPerSecond: calcRate(i => i.value.webhook / 1000)
  }

  const res = {
    bulk
  }

  for (const field in aggregators) {
    res[field] = aggregators[field](marks)
  }

  res.cpus = cpus.map((cpu, cpuid) => {
    const stats = {}

    for (const key in cpu.times) {
      stats[key] = cpu.times[key] - prevCpus[cpuid].times[key]
    }

    return stats
  })

  res.cpuUserPercent = res.cpus.map(cpu => {
    const stats = {}
    let total = 0

    for (const key in cpu) {
      total += cpu[key]
    }

    // for (const key in cpu) {
    //   stats[key] = cpu[key] / total
    // }

    return Math.floor(cpu.user / total * 100 * 100) / 100
  })

  prevCpus = cpus

  console.dir(res, { depth: null })

  return res
})
  .catch(e => {
    console.error(e)
  })
  .then(() => {
    server.close()
  })

function handle (signal) {
  console.log(`Received ${signal}`)
  stopped = true
}

process.on('SIGINT', handle)
process.on('SIGTERM', handle)
