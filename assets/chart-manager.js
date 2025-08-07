// Chart Manager for WISE6610 Data Analyzer
// Handles Chart.js initialization and rendering

let barChart;

/**
 * Initialize the bar chart
 */
function initializeChart() {
  // Chart will be initialized when first data is loaded
  console.log('Chart manager initialized');
}

/**
 * Render Sector1 bar chart with loss rate statistics
 * @param {Object} dataByDate - Data grouped by date
 * @param {number} threshold - Loss rate threshold
 */
function renderBarChart(dataByDate, threshold) {
  const dates = Object.keys(dataByDate).sort();
  const normal = [], abnormal = [];
  
  dates.forEach(d => {
    const dayStats = dataByDate[d][0]; // Get the first (and only) stats object for this date
    normal.push(dayStats.normalcnt || 0);
    abnormal.push(dayStats.abnormalcnt || 0);
  });
  
  // Calculate total from Node_Statistics directly (not sum of daily stats)
  let totalNormal = 0, totalAbnormal = 0;
  organizedRecords.Node_Statistics.forEach(nodeStats => {
    if (nodeStats.LossRate > threshold) {
      totalAbnormal++;
    } else {
      totalNormal++;
    }
  });
  
  // Add total bar at front
  dates.unshift('Total');
  normal.unshift(totalNormal);
  abnormal.unshift(totalAbnormal);
  
  if (barChart) barChart.destroy();
  const ctx = document.getElementById('barChart').getContext('2d');
barChart = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: dates,
        datasets: [
            { 
                label: 'Normal', 
                data: normal, 
                backgroundColor: 'rgba(75,192,192,0.7)',
                borderColor: 'rgba(75,192,192,1)',
                borderWidth: 1
            },
            { 
                label: 'Abnormal', 
                data: abnormal, 
                backgroundColor: 'rgba(255,99,132,0.7)',
                borderColor: 'rgba(255,99,132,1)',
                borderWidth: 1
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: 'Node Loss Rate Statistics'
            },
            legend: {
                display: true,
                position: 'top'
            }
        },
        scales: {
            x: {
                stacked: true,
                title: {
                    display: true,
                    text: 'Date'
                }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Number of Nodes'
                }
            }
        },
        onClick(evt, elems) {
            if (!elems.length) return;
            const idx = elems[0].index;
            const datasetIdx = elems[0].datasetIndex;
            const label = dates[idx];

            if (label === 'Total') {
            // When clicking Total column, determine Normal/Abnormal based on datasetIndex
                if (datasetIdx === 0) {
                    // Normal
                    if (typeof showNodeStatistics === 'function') {
                    showNodeStatistics(
                        organizedRecords.Node_Statistics.filter(nodeStats => nodeStats.LossRate <= threshold)
                    );
                    } else {
                    console.error('showNodeStatistics function not available');
                    }
                } else if (datasetIdx === 1) {
                    // Abnormal
                    if (typeof showNodeStatistics === 'function') {
                    showNodeStatistics(
                        organizedRecords.Node_Statistics.filter(nodeStats => nodeStats.LossRate > threshold)
                    );
                    } else {
                    console.error('showNodeStatistics function not available');
                    }
                }
                return;
            }

            // Non-Total column, determine Normal/Abnormal based on datasetIndex
            const selectedDate = label;
            if (typeof showDateNodeStatistics === 'function') {
                if (datasetIdx === 0) {
                    // Normal
                    showDateNodeStatistics(selectedDate, threshold, 'normal');
                } else if (datasetIdx === 1) {
                    // Abnormal
                    showDateNodeStatistics(selectedDate, threshold, 'abnormal');
                } else {
                    // Other dataset
                    showDateNodeStatistics(selectedDate, threshold);
                }
            } else {
                console.error('showDateNodeStatistics function not available');
            }
        }
    }
});
}

/**
 * Update chart with new threshold data
 * @param {Object} dataByDate - Updated data grouped by date
 * @param {number} threshold - New threshold value
 */
function updateChart(dataByDate, threshold) {
  renderBarChart(dataByDate, threshold);
}

/**
 * Destroy the current chart
 */
function destroyChart() {
  if (barChart) {
    barChart.destroy();
    barChart = null;
  }
}

/**
 * Get chart instance for external access
 * @returns {Chart|null} Current chart instance
 */
function getChartInstance() {
  return barChart;
}

/**
 * Check if chart is initialized
 * @returns {boolean} True if chart exists
 */
function isChartInitialized() {
  return barChart !== null && barChart !== undefined;
}

/**
 * Resize chart (useful for responsive behavior)
 */
function resizeChart() {
  if (barChart) {
    barChart.resize();
  }
}

// Auto-resize chart when window is resized
window.addEventListener('resize', () => {
  if (isChartInitialized()) {
    setTimeout(resizeChart, 100); // Small delay to ensure proper sizing
  }
});

// Initialize chart manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeChart();
});
