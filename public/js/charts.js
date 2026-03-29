/* =================================================================
   charts.js — Chart.js initialisation and update helpers
   ================================================================= */

let perfChart = null;
let rsiChart  = null;
let macdChart = null;

const COLORS = {
  'IWFQ.L': { line: '#448aff', fill: 'rgba(68,138,255,0.08)'  },
  'IWFV.L': { line: '#ff9100', fill: 'rgba(255,145,0,0.08)'   },
  'IWFM.L': { line: '#00e676', fill: 'rgba(0,230,118,0.08)'   }
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  animation: { duration: 400 },
  plugins: {
    legend: { labels: { color: '#8892a4', boxWidth: 12, font: { size: 11 } } },
    tooltip: { backgroundColor: '#141928', borderColor: '#252d45', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#8892a4' }
  },
  scales: {
    x: {
      ticks: { color: '#8892a4', maxTicksLimit: 8, font: { size: 10 } },
      grid:  { color: '#1e2640' }
    },
    y: {
      ticks: { color: '#8892a4', font: { size: 10 } },
      grid:  { color: '#1e2640' }
    }
  }
};

// Rebase prices to 100 at the first data point
function rebase(prices) {
  if (!prices || prices.length === 0) return [];
  const base = prices[0];
  if (!base || base === 0) return prices.map(() => null);
  return prices.map(p => p != null ? parseFloat(((p / base) * 100).toFixed(3)) : null);
}

function initPerfChart(etfs) {
  const ctx = document.getElementById('perf-chart').getContext('2d');

  // Use the ETF with the most data points as the x-axis reference
  const refEtf  = [...etfs].sort((a, b) => b.chartData.dates.length - a.chartData.dates.length)[0];
  const labels  = refEtf?.chartData.dates ?? [];

  const datasets = etfs.map(etf => ({
    label:           etf.ticker,
    data:            rebase(etf.chartData.prices),
    borderColor:     COLORS[etf.ticker]?.line ?? '#fff',
    backgroundColor: COLORS[etf.ticker]?.fill ?? 'transparent',
    borderWidth:     2,
    pointRadius:     0,
    tension:         0.3,
    fill:            false
  }));

  if (perfChart) perfChart.destroy();
  perfChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}`
          }
        }
      }
    }
  });
}

function updatePerfChart(etfs) {
  if (!perfChart) return initPerfChart(etfs);
  const refEtf  = [...etfs].sort((a, b) => b.chartData.dates.length - a.chartData.dates.length)[0];
  perfChart.data.labels = refEtf?.chartData.dates ?? [];
  etfs.forEach((etf, i) => {
    if (perfChart.data.datasets[i]) {
      perfChart.data.datasets[i].data = rebase(etf.chartData.prices);
    }
  });
  perfChart.update('none');
}

function showDetailCharts(etf) {
  // RSI chart
  const rsiCtx = document.getElementById('rsi-chart').getContext('2d');
  if (rsiChart) rsiChart.destroy();
  rsiChart = new Chart(rsiCtx, {
    type: 'line',
    data: {
      labels: etf.chartData.rsiDates,
      datasets: [{
        label:           `RSI (14)`,
        data:            etf.chartData.rsi,
        borderColor:     COLORS[etf.ticker]?.line ?? '#fff',
        backgroundColor: COLORS[etf.ticker]?.fill ?? 'transparent',
        borderWidth:     2,
        pointRadius:     0,
        tension:         0.2,
        fill:            false
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        annotation: undefined
      },
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min: 0,
          max: 100,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => `${v}`
          }
        }
      }
    },
    plugins: [{
      // Draw horizontal reference lines at 30 and 70
      id: 'rsi-lines',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea) return;
        ctx.save();
        [30, 70].forEach(level => {
          const y = scales.y.getPixelForValue(level);
          ctx.beginPath();
          ctx.strokeStyle = level === 70 ? 'rgba(255,23,68,0.4)' : 'rgba(0,230,118,0.4)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
        });
        ctx.restore();
      }
    }]
  });

  // MACD chart (mixed: bar for histogram, lines for MACD and signal)
  const macdCtx = document.getElementById('macd-chart').getContext('2d');
  if (macdChart) macdChart.destroy();

  const history = etf.chartData.macdHistory ?? [];
  // MACD history is offset from price — compute dates by slicing from end
  const macdLen   = history.length;
  const allDates  = etf.chartData.dates ?? [];
  const macdDates = allDates.slice(-macdLen);

  macdChart = new Chart(macdCtx, {
    type: 'bar',
    data: {
      labels: macdDates,
      datasets: [
        {
          type:            'bar',
          label:           'Histogram',
          data:            history.map(h => h.histogram),
          backgroundColor: history.map(h =>
            h.histogram >= 0 ? 'rgba(0,230,118,0.4)' : 'rgba(255,23,68,0.4)'
          ),
          borderColor:     history.map(h =>
            h.histogram >= 0 ? 'rgba(0,230,118,0.7)' : 'rgba(255,23,68,0.7)'
          ),
          borderWidth: 1
        },
        {
          type:        'line',
          label:       'MACD',
          data:        history.map(h => h.macd),
          borderColor: '#448aff',
          borderWidth: 2,
          pointRadius: 0,
          tension:     0.3,
          fill:        false
        },
        {
          type:        'line',
          label:       'Signal',
          data:        history.map(h => h.signal),
          borderColor: '#ff9100',
          borderWidth: 1.5,
          pointRadius: 0,
          tension:     0.3,
          fill:        false
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: CHART_DEFAULTS.scales.x,
        y: CHART_DEFAULTS.scales.y
      }
    }
  });
}

function destroyDetailCharts() {
  if (rsiChart)  { rsiChart.destroy();  rsiChart  = null; }
  if (macdChart) { macdChart.destroy(); macdChart = null; }
}
