const axios = require('axios')
const express = require('express')
const promMid = require('express-prometheus-middleware')
const Prometheus = require('prom-client')

const { PORT, WEBHOOK_PORT, BLACKHOLE_WEBHOOK } = process.env

const webhookCounter = new Prometheus.Counter({
  name: 'webhook_requests_total',
  help: 'Counter for total webhooks sent',
  labelNames: [],
});

const app = express()

app.use(promMid({
  metricsPath: '/metrics',
  collectDefaultMetrics: true
}))

app.get('/:hostname/:port/:id', (req, res) => {
  const { hostname, port, id } = req.params

  webhookCounter.inc()

  axios.get(`http://${hostname}:${port}/${id}`)
    .catch(e => console.error('request failed:', e.toString(), id))

  res.send('ok')
})

app.listen(PORT, () => {
  console.log('listening on port', PORT)
})
