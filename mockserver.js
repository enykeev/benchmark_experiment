const axios = require('axios')
const express = require('express')

const { PORT, WEBHOOK_PORT } = process.env

const app = express()

app.get('/:hostname/:port/:id', (req, res) => {
  const { hostname, port, id } = req.params
  axios.get(`http://${hostname}:${port}/${id}`)
    .catch(e => console.error('request failed:', e.toString(), id))

  res.send('ok')
})

app.listen(PORT, () => {
  console.log('listening on port', PORT)
})
