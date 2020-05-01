const fs = require('fs')

function parse (filename, offset) {
  const content = fs.readFileSync(filename)

  const marks = JSON.parse(content)

  const x = marks.map((i, k) => k)
  const rtt = marks.map(i => i.response - i.start)
  const e2e = marks.map(i => i.webhook - i.start)

  return [{
    name: 'rtt',
    x,
    y: rtt
  }, {
    name: 'e2e',
    x,
    y: e2e
  }]
}

const plots = fs.readdirSync('./data')
  .map((filename, n) => parse(`./data/${filename}`, n*500))
  .flat()

fs.writeFileSync('./plots/1.json', JSON.stringify(plots, null, 2))
