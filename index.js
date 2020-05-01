import Plotly from 'plotly.js/lib/core'
import LineChart from 'plotly.js/lib/pie'

import plot from './plots/1'

Plotly.register([
  LineChart
]);

const data = plot

const style = {
  margin: {
    t: 0
  }
}

Plotly.newPlot(document.getElementById('plot'), data, style, { displayModeBar: false });
