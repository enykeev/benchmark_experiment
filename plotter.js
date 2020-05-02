const fs = require('fs')

const _ = require('lodash')

function parse (filename) {
  const content = fs.readFileSync(filename)

  const marks = JSON.parse(content)

  const origin = marks[0].ts - marks[0].initial

  return _.map(marks, m => {
    return [{
      type: 'request',
      time: origin + m.start
    }, {
      type: m.status,
      time: origin + m.response
    },{
      type: 'webhook',
      time: origin + m.webhook
    }]
  })
}

const plots = _.chain(fs.readdirSync('./data'))
  .map((filename, n) => parse(`./data/${filename}`))
  .flattenDeep()
  .groupBy('type')
  .map((i, name) => {
    return {
      name,
      ..._.chain(i)
      .filter(({ time }) => !_.isNaN(time))
      .groupBy(({ time }) => Math.floor(time / 1000))
      .mapValues('length')
      .toPairs()
      .sortBy(i => i[0])
      .reduce(({ x, y }, [k, v]) => {
        return {
          x: [...x, new Date(k * 1000).toISOString()],
          y: [...y, v]
        }
      }, {
        x: [],
        y: []
      })
      .value()
    }
  })
  .value()

//console.log(plots)

fs.writeFileSync('./plots/1.json', JSON.stringify(plots, null, 2))
