import _ from 'lodash'
import * as ss from 'simple-statistics'
import Plotly from 'plotly.js/lib/core'
import LineChart from 'plotly.js/lib/pie'

Plotly.register([
  LineChart
]);

const marks = {}

const style = {
  margin: {
    t: 30
  }
}

const el = document.getElementById('plot')
const ws = window.ws = new WebSocket(`ws://localhost:6550/?type=ui`);

Plotly.newPlot(el, null, style);

ws.onmessage = function(event) {
  const data = JSON.parse(event.data);

  if (data.type === 'marks') {
    _.forEach(data.marks, (values, name) => {
      marks[name] = [
        ...(marks[name] || []),
        ...values
      ]
    })
  }

  const d = _.map(marks, (i, name) => {
    return {
      name,
      ..._.chain(i)
      .filter(({ time }) => !_.isNaN(time))
      .groupBy(({ time }) => Math.floor(time / 1000))
      .mapValues(bucket => {
        if (['rtt', 'e2e'].indexOf(name) !== -1) {
          const values = _.map(bucket, 'value')
          return ss.mean(values)
        } else {
          return bucket.length
        }
      })
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

  Plotly.react(el, d, style)
};
