// Table Manager for WISE6610 Data Analyzer
// Handles DataTable initialization and management

let currentDataTable = null;
let currentTableType = null; // Track current table type: 'nodeStats' or 'rawData'

/**
 * Get common DataTable configuration
 * @param {string} tableType - Type of table ('nodeStats' or 'rawData')
 * @returns {Object} DataTable configuration object
 */
function getDataTableConfig(tableType) {
  const baseConfig = {
    responsive: true,
    pageLength: 5,
    lengthMenu: [[5, 10, 25, 50, 100, -1], [5, 10, 25, 50, 100, "All"]],
    scrollX: true,
    scrollCollapse: true,
    fixedHeader: true,
    fixedColumns: {
      leftColumns: 2
    },
    language: {
      emptyTable: "No data available",
      zeroRecords: "No matching records found",
      search: "Search:",
      lengthMenu: "Show _MENU_ entries",
      info: "Showing _START_ to _END_ of _TOTAL_ entries",
      infoEmpty: "Showing 0 to 0 of 0 entries",
      infoFiltered: "(filtered from _MAX_ total entries)",
      paginate: {
        first: "First",
        last: "Last",
        next: "Next",
        previous: "Previous"
      }
    },
    initComplete: function() {
      applyTableHeaderStyles();
    }
  };

  if (tableType === 'nodeStats') {
    return {
      ...baseConfig,
      order: [[5, 'desc']], // Sort by Loss Rate column descending
      columnDefs: [
        {
          targets: [0], // Devname column
          width: '120px'
        },
        {
          targets: [1], // Devaddr column
          width: '100px'
        },
        {
          targets: [2, 3, 4], // Total, Expected, Lost columns
          type: 'num',
          width: '80px'
        },
        {
          targets: [5], // LossRate column
          type: 'num',
          width: '100px',
          render: function(data, type, row, meta) {
            if (type === 'display') {
              return data;
            } else if (type === 'type' || type === 'sort') {
              return parseFloat(data.toString().replace('%', ''));
            }
            return data;
          }
        }
      ]
    };
  } else if (tableType === 'rawData') {
    return {
      ...baseConfig,
      order: [[0, 'desc']], // Sort by Time column descending
      columnDefs: [
        { 
          targets: [0], // Time column
          type: 'date',
          width: '160px'
        },
        {
          targets: [1], // Devname column
          width: '120px'
        },
        {
          targets: [2], // Devaddr column
          width: '100px'
        },
        {
          targets: [3, 6, 7, 8], // Fcnt, RSSI, SNR, Port columns
          type: 'num',
          width: '80px'
        },
        {
          targets: [4], // Cnf column
          width: '60px'
        },
        {
          targets: [5], // Freq column
          width: '120px'
        }
      ],
      drawCallback: function(settings) {
        applyTableHeaderStyles();
      }
    };
  }
}
/**
 * Initialize the DataTable with default settings
 */
function initializeTable() {
  // Initialize empty DataTable for Node Statistics
  if (currentDataTable) {
    destroyCurrentTable();
  }
  
  updateTableHeader('nodeStats');
  currentDataTable = $('#detailTable').DataTable(getDataTableConfig('nodeStats'));
  currentTableType = 'nodeStats';
}

/**
 * Apply consistent header styles to the table
 */
function applyTableHeaderStyles() {
  $('#detailTable thead th').css({
    'background-color': '#444',
    'color': '#fff',
    'border': '1px solid #444',
    'text-align': 'center',
    'font-weight': 'bold'
  });
}

/**
 * Update table header based on data type
 * @param {string} dataType - Type of data ('nodeStats' or 'rawData')
 */
function updateTableHeader(dataType) {
  const thead = document.querySelector('#detailTable thead tr');
  if (!thead) {
    console.error('Table thead not found');
    return;
  }
  
  thead.innerHTML = '';
  
  if (dataType === 'nodeStats') {
    // Node Statistics headers
    ['Devname', 'Devaddr', 'Total', 'Expected', 'Lost', 'Loss Rate (%)'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      thead.appendChild(th);
    });
  } else if (dataType === 'rawData') {
    // Raw CSV data headers
    ['Time', 'Devname', 'Devaddr', 'Fcnt', 'Cnf', 'Freq', 'RSSI', 'SNR', 'Port'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      thead.appendChild(th);
    });
  }
}

/**
 * Destroy current DataTable if it exists
 */
function destroyCurrentTable() {
  if (currentDataTable && $.fn.DataTable.isDataTable('#detailTable')) {
    currentDataTable.destroy();
    currentDataTable = null;
    currentTableType = null;
  }
}

/**
 * Show raw CSV data in the table
 * @param {Array} recs - Array of raw CSV records
 */
function showTable(recs) {
  const tbody = document.querySelector('#detailTable tbody');
  if (!tbody) {
    console.error('Table tbody not found');
    return;
  }
  
  // Check if we need to rebuild the table structure
  const needsRebuild = currentTableType !== 'rawData';
  
  if (needsRebuild) {
    // Destroy existing DataTable and rebuild for raw data
    destroyCurrentTable();
    updateTableHeader('rawData');
    
    // Clear and populate tbody
    tbody.innerHTML = '';
    recs.forEach((r, i) => {
      const tr = document.createElement('tr');
      ['Time','Devname','Devaddr','Fcnt','Cnf','Freq','RSSI','SNR','Port'].forEach(key => {
        const td = document.createElement('td');
        if (key === 'Time') {
          td.textContent = r.Time.toLocaleString();
        } else if (key === 'Cnf') {
          td.textContent = r.Cnf ? 'true' : 'false';
        } else if (key === 'Freq') {
          td.textContent = r.Freq ? r.Freq.toFixed(6) : '';
        } else {
          td.textContent = r[key] || '';
        }
        tr.appendChild(td);
      });
      tr.addEventListener('click', () => console.log(`Row ${i+1} clicked:`, r));
      tbody.appendChild(tr);
    });
    
    // Initialize new DataTable for raw data
    setTimeout(() => {
      currentDataTable = $('#detailTable').DataTable(getDataTableConfig('rawData'));
      currentTableType = 'rawData';
    }, 100);
  } else {
    // Just update the data without rebuilding
    const tableData = recs.map((r, i) => {
      const row = [
        r.Time.toLocaleString(),
        r.Devname || '',
        r.Devaddr || '',
        r.Fcnt || '',
        r.Cnf ? 'true' : 'false',
        r.Freq ? r.Freq.toFixed(6) : '',
        r.RSSI || '',
        r.SNR || '',
        r.Port || ''
      ];
      return row;
    });
    
    currentDataTable.clear();
    currentDataTable.rows.add(tableData);
    currentDataTable.draw();
  }
}

/**
 * Show All Node Statistics in the table
 * @param {Array} nodeStats - Array of node statistics
 */
function showNodeStatistics(nodeStats) {
  console.log('Showing Node Statistics:', nodeStats);
  const tbody = document.querySelector('#detailTable tbody');
  if (!tbody) {
    console.error('Table tbody not found');
    return;
  }
  
  // Check if we need to rebuild the table structure
  const needsRebuild = currentTableType !== 'nodeStats';
  
  if (needsRebuild) {
    // Destroy existing DataTable and rebuild for node statistics
    destroyCurrentTable();
    updateTableHeader('nodeStats');
    
    // Clear tbody and populate with data
    tbody.innerHTML = '';
    
    if (!nodeStats || nodeStats.length === 0) {
      // If no data, show empty state
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'No Data Available';
      td.style.textAlign = 'center';
      td.style.padding = '20px';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      nodeStats.forEach((node, i) => {
        const tr = document.createElement('tr');
        ['Devname','Devaddr','Total','Expected','Lost','LossRate'].forEach(key => {
          const td = document.createElement('td');
          if (key === 'LossRate') {
            // Store raw number for sorting, display with %
            const lossRate = parseFloat(node[key]);
            td.textContent = node[key] + '%';
            td.setAttribute('data-sort', node[key]); // For sorting
            
            // Add color coding based on loss rate
            if (lossRate === 0) {
              td.style.color = '#51cf66'; // Green for 0%
              td.style.fontWeight = '600';
            } else if (lossRate <= 5) {
              td.style.color = '#ffd43b'; // Yellow for 1-5%
              td.style.fontWeight = '600';
            } else if (lossRate <= 10) {
              td.style.color = '#ff922b'; // Orange for 6-10%
              td.style.fontWeight = '600';
            } else {
              td.style.color = '#ff6b6b'; // Red for >10%
              td.style.fontWeight = '700';
            }
          } else {
            td.textContent = node[key] || '';
          }
          tr.appendChild(td);
        });
        tr.addEventListener('click', () => console.log(`Node ${i+1} clicked:`, node));
        tbody.appendChild(tr);
      });
    }
    
    // Initialize DataTable with Node Statistics column configuration
    setTimeout(() => {
      currentDataTable = $('#detailTable').DataTable(getDataTableConfig('nodeStats'));
      currentTableType = 'nodeStats';
    }, 100);
  } else {
    // Just update the data without rebuilding
    if (!nodeStats || nodeStats.length === 0) {
      currentDataTable.clear().draw();
    } else {
      const tableData = nodeStats.map(node => {
        const lossRate = parseFloat(node.LossRate);
        return [
          node.Devname || '',
          node.Devaddr || '',
          node.Total || '',
          node.Expected || '',
          node.Lost || '',
          node.LossRate + '%'
        ];
      });
      
      currentDataTable.clear();
      currentDataTable.rows.add(tableData);
      currentDataTable.draw();
      
      // Apply color coding after drawing
      setTimeout(() => {
        $('#detailTable tbody tr').each(function(index) {
          const lossRateCell = $(this).find('td:eq(5)');
          const lossRateText = lossRateCell.text();
          const lossRate = parseFloat(lossRateText.replace('%', ''));
          
          if (lossRate === 0) {
            lossRateCell.css({'color': '#51cf66', 'font-weight': '600'});
          } else if (lossRate <= 5) {
            lossRateCell.css({'color': '#ffd43b', 'font-weight': '600'});
          } else if (lossRate <= 10) {
            lossRateCell.css({'color': '#ff922b', 'font-weight': '600'});
          } else {
            lossRateCell.css({'color': '#ff6b6b', 'font-weight': '700'});
          }
        });
      }, 50);
    }
  }
}

/**
 * Show Node Statistics for a specific date
 * @param {string} selectedDate - Date in YYYY-MM-DD format
 * @param {number} threshold - Loss rate threshold
 * @param {string} filterType - Filter type: 'normal', 'abnormal', or undefined for all above threshold
 */
function showDateNodeStatistics(selectedDate, threshold, filterType) {
    console.log(`Showing Node Statistics for ${selectedDate} with threshold ${threshold} and filter type ${filterType}`);
    // Get date-specific statistics from data processor
    if (typeof getDateNodeStatistics === 'function') {
        const dateNodeStats = getDateNodeStatistics(selectedDate);
        
        let filteredStats;
        if (filterType === 'normal') {
        // Show nodes with loss rate <= threshold (Normal)
        filteredStats = dateNodeStats.filter(node => node.LossRate <= threshold);
        } else if (filterType === 'abnormal') {
        // Show nodes with loss rate > threshold (Abnormal)
        filteredStats = dateNodeStats.filter(node => node.LossRate > threshold);
        } else {
        // Default behavior: show nodes with loss rate > threshold (for backward compatibility)
        filteredStats = dateNodeStats.filter(node => node.LossRate > threshold);
        }
        
        showNodeStatistics(filteredStats);
    } else {
        console.error('getDateNodeStatistics function not available');
    }
}

/**
 * Refresh current table data
 */
function refreshTable() {
  if (currentDataTable) {
    currentDataTable.ajax.reload();
  }
}

/**
 * Get current DataTable instance
 * @returns {DataTable|null} Current DataTable instance
 */
function getCurrentTable() {
  return currentDataTable;
}

/**
 * Get current table type
 * @returns {string|null} Current table type
 */
function getCurrentTableType() {
  return currentTableType;
}

/**
 * Check if table is initialized
 * @returns {boolean} True if table exists
 */
function isTableInitialized() {
  return currentDataTable !== null && $.fn.DataTable.isDataTable('#detailTable');
}

// Initialize table when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeTable();
});
