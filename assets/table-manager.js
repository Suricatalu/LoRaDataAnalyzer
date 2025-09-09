// Table Manager (v2) - 對應新版 analytics NodeStat 結構

let currentDataTable = null;
let currentTableType = null; // Track current table type: 'nodeStats' or 'rawData'

/**
 * Get common DataTable configuration with scrollX for horizontal overflow
 * @param {string} tableType - Type of table ('nodeStats' or 'rawData')
 * @returns {Object} DataTable configuration object
 */
function getDataTableConfig(tableType) {
  const baseConfig = {
    scrollX: true,        // 啟用水平捲動
    scrollCollapse: true, // 內容變窄時收合捲動寬度
    autoWidth: false,     // 關掉自動計算寬度
    responsive: false,    // 關掉 responsive 避免衝突
    pageLength: 10,
    lengthMenu: [[5, 10, 25, 50, 100, -1], [5, 10, 25, 50, 100, "All"]],
    columnDefs: [
      // 數值欄位右對齊
      {
        targets: [2, 4, 5, 8, 9, 10, 11], // Loss Rate, Avg RSSI, Avg SNR, FCNT Delta, Duplicate Count, Total Uplink Count, FCNT Reset Count
        className: 'dt-body-right'
      },
      // 時間欄位置中對齊
      {
        targets: [6, 7], // First Uplink Time, Last Uplink Time
        className: 'dt-body-center'
      },
      // DevAddr、Exception 和 Used Data Rate 置中對齊
      {
        targets: [1, 3, 12], // Devaddr, Exception, Used Data Rate
        className: 'dt-body-center'
      }
    ],
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
      // 確保表格寬度正確計算
      this.api().columns.adjust();
    },
    drawCallback: function() {
      // 每次重繪後重新調整欄寬
      this.api().columns.adjust();
    }
  };

  if (tableType === 'nodeStats') {
    baseConfig.columns = [
      { title: "Devname", data: "devname" },
      { title: "Devaddr", data: "devaddr" },
      { title: "Loss Rate (%)", data: "lossRate" },
      { title: "Exception", data: "exception" },
      { title: "Avg RSSI", data: "avgRSSI" },
      { title: "Avg SNR", data: "avgSNR" },
      { title: "First Uplink Time", data: "firstUplinkTime" },
      { title: "Last Uplink Time", data: "lastUplinkTime" },
      { title: "FCNT Delta", data: "fcntDelta" },
      { title: "Duplicate Count", data: "duplicateCount" },
      { title: "Total Uplink Count", data: "totalUplinkCount" },
      { title: "FCNT Reset Count", data: "fcntResetCount" },
      { title: "Used Data Rate", data: "usedDataRate" }
    ];
  }

  return baseConfig;
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
  currentDataTable.clear().draw();
}

/**
 * Update table header based on data type
 * @param {string} dataType - Type of data ('nodeStats' or 'rawData')
 */
function updateTableHeader(dataType) {
  const table = document.querySelector('#detailTable');
  if (!table) {
    console.error('Table not found');
    return;
  }
  
  // 確保表格有 thead 元素
  let thead = table.querySelector('thead');
  if (!thead) {
    thead = document.createElement('thead');
    table.appendChild(thead);
  }
  
  // 確保 thead 有 tr 元素
  let tr = thead.querySelector('tr');
  if (!tr) {
    tr = document.createElement('tr');
    thead.appendChild(tr);
  }
  
  // 清空現有的標題
  tr.innerHTML = '';
  
  if (dataType === 'nodeStats') {
    // v2 Node Statistics headers (perNode.total + timeline 部分欄位)
  ['Devname', 'Devaddr', 'Loss Rate (%)', 'Exception', 'Avg RSSI', 'Avg SNR', 'First Uplink Time', 'Last Uplink Time', 'FCNT Delta', 'Duplicate Count', 'Total Uplink Count', 'FCNT Reset Count', 'Used Data Rate'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      tr.appendChild(th);
    });
  } else if (dataType === 'rawData') {
    // Raw CSV data headers
    ['Time', 'Devname', 'Devaddr', 'Fcnt', 'Cnf', 'Freq', 'RSSI', 'SNR', 'Port'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      tr.appendChild(th);
    });
  }
  
  // 確保表格有 tbody 元素
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
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
 * Show Node Statistics in the table (支援特定日期過濾)
 * @param {Array} nodeStats - Array of node statistics
 * @param {string|null} selectedDate - Optional date in YYYY-MM-DD format to show daily stats, null for total stats
 */
function showNodeStatistics(nodeStats, selectedDate = null) {
  console.log('[Table] showNodeStatistics count=', nodeStats?.length || 0, 'selectedDate=', selectedDate);
  
  const table = document.querySelector('#detailTable');
  if (!table) {
    console.error('Table not found');
    return;
  }
  
  // 確保表格有 tbody 元素
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }
  
  // Check if we need to rebuild the table structure or if DataTable needs initialization
  const needsRebuild = currentTableType !== 'nodeStats' || !currentDataTable || !$.fn.DataTable.isDataTable('#detailTable');

  if (needsRebuild) {
    // Destroy existing DataTable and rebuild for node statistics
    destroyCurrentTable();
    updateTableHeader('nodeStats');
    console.log('[Table] showNodeStatistics rebuilding table', nodeStats);
    // Clear tbody and populate with data
    tbody.innerHTML = '';
    
    if (!nodeStats || nodeStats.length === 0) {
      // If no data, show empty state
      const tr = document.createElement('tr');
      const td = document.createElement('td');
  td.colSpan = 13; // Correct colspan for nodeStats (新增 Exception 欄)
      td.textContent = 'No Data Available';
      td.style.textAlign = 'center';
      td.style.padding = '20px';
      td.style.fontStyle = 'italic';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      nodeStats.forEach((node) => {
        const tr = document.createElement('tr');
        const devName = node.id?.devName || '';
        const devAddr = node.id?.devAddr || '';

        // 根據 selectedDate 決定顯示總計或特定日期數據
        let statsData;
        if (selectedDate) {
          // 顯示特定日期的數據
          const dailyStats = node.daily?.find(d => d.date === selectedDate);
          if (dailyStats) {
            statsData = {
              lossRate: dailyStats.lossRate,
              avgRSSI: dailyStats.avgRSSI,
              avgSNR: dailyStats.avgSNR,
              firstTime: dailyStats.firstTime,
              lastTime: dailyStats.lastTime,
              fcntSpan: dailyStats.fcntSpan,
              duplicatePackets: dailyStats.duplicatePackets,
              totalWithDuplicates: dailyStats.totalWithDuplicates,
              resetCount: dailyStats.resetCount,
              dataRatesUsed: dailyStats.dataRatesUsed || []
            };
          } else {
            // 該節點在選定日期沒有數據
            statsData = {
              lossRate: null,
              avgRSSI: null,
              avgSNR: null,
              firstTime: null,
              lastTime: null,
              fcntSpan: null,
              duplicatePackets: null,
              totalWithDuplicates: null,
              resetCount: null,
              dataRatesUsed: []
            };
          }
        } else {
          // 顯示總計數據
          statsData = {
            lossRate: node.total?.lossRate,
            avgRSSI: node.total?.avgRSSI,
            avgSNR: node.total?.avgSNR,
            firstTime: node.timeline?.firstTime,
            lastTime: node.timeline?.lastTime,
            fcntSpan: node.timeline?.fcntSpan,
            duplicatePackets: node.total?.duplicatePackets,
            totalWithDuplicates: node.total?.totalWithDuplicates,
            resetCount: node.total?.resetCount,
            dataRatesUsed: node.total?.dataRatesUsed || []
          };
        }

  // 例外顯示：若選了特定日期，只使用當日例外；未選日期才使用總覽例外
  let exceptionLabels = [];
  let exceptionTags = [];
  let exceptionNoteMap = {};
  if (selectedDate) {
    const dailyStats = node.daily?.find(d => d.date === selectedDate);
    if (dailyStats) {
      exceptionLabels = Array.isArray(dailyStats.exceptionLabels) ? dailyStats.exceptionLabels : [];
      exceptionTags = Array.isArray(dailyStats.exceptionTags) ? dailyStats.exceptionTags : [];
      exceptionNoteMap = dailyStats.exceptionNoteMap || {};
    }
    // 不回退到 total，避免「當日 normal 仍顯示總體例外」
  } else {
    exceptionLabels = (node.total && Array.isArray(node.total.exceptionLabels)) ? node.total.exceptionLabels : [];
    exceptionTags = (node.total && Array.isArray(node.total.exceptionTags)) ? node.total.exceptionTags : [];
    exceptionNoteMap = (node.total && node.total.exceptionNoteMap) ? node.total.exceptionNoteMap : {};
  }
  const exCodeMap = { resetCount: 'RST', maxGapMinutes: 'GAP', inactiveSinceMinutes: 'INACT' };
  const exColorMap = { resetCount: '#ff6b6b', maxGapMinutes: '#4dabf7', inactiveSinceMinutes: '#ffa94d' };
        const rowData = {
          Devname: devName,
          Devaddr: devAddr,
          'Loss Rate (%)': safeToFixed(statsData.lossRate, 2),
          'Exception': exceptionLabels.length ? exceptionLabels.join(' | ') : '',
          'Avg RSSI': safeToFixed(statsData.avgRSSI, 2),
          'Avg SNR': safeToFixed(statsData.avgSNR, 2),
          'First Uplink Time': statsData.firstTime ? new Date(statsData.firstTime).toLocaleString() : '',
          'Last Uplink Time': statsData.lastTime ? new Date(statsData.lastTime).toLocaleString() : '',
          'FCNT Delta': statsData.fcntSpan ?? '',
          'Duplicate Count': statsData.duplicatePackets ?? '',
          'Total Uplink Count': statsData.totalWithDuplicates ?? '',
          'FCNT Reset Count': statsData.resetCount ?? '',
    'Used Data Rate': Array.from(statsData.dataRatesUsed).join(', '),
        };

  ['Devname', 'Devaddr', 'Loss Rate (%)', 'Exception', 'Avg RSSI', 'Avg SNR', 'First Uplink Time', 'Last Uplink Time', 'FCNT Delta', 'Duplicate Count', 'Total Uplink Count', 'FCNT Reset Count', 'Used Data Rate'].forEach(key => {
          const td = document.createElement('td');
          if (key === 'Devname') {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = rowData[key] || '';
            link.classList.add('devname-link');
            link.dataset.devname = rowData[key];
            link.dataset.devaddr = rowData['Devaddr'];
            td.appendChild(link);
          } else if (key === 'Exception') {
            // 以短代碼顯示，最多 2 個，其餘用 +N 表示；滑過顯示詳細說明
            const labels = exceptionLabels;
            const tags = exceptionTags;
            if (labels.length) {
              const items = labels.map((label, i) => ({
                tag: tags[i], label,
                code: exCodeMap[tags[i]] || (label.length > 6 ? label.slice(0,6).toUpperCase() : label.toUpperCase()),
                notes: Array.isArray(exceptionNoteMap[tags[i]]) ? exceptionNoteMap[tags[i]] : []
              }));
              const container = document.createElement('div');
              container.style.display = 'flex';
              container.style.flexWrap = 'wrap';
              container.style.gap = '4px';

              // 顯示所有短代碼徽章
              items.forEach(it => {
                const span = document.createElement('span');
                span.textContent = it.code;
                span.style.padding = '1px 6px';
                span.style.borderRadius = '10px';
                span.style.fontSize = '12px';
                span.style.background = 'rgba(255,255,255,0.08)';
                span.style.border = `1px solid ${exColorMap[it.tag] || 'rgba(255,255,255,0.35)'}`;
                span.style.color = exColorMap[it.tag] || '#ddd';
                // Tooltip：顯示完整標籤與規則說明
                const tipLines = [it.label].concat(it.notes || []);
                span.title = tipLines.join('\n');
                container.appendChild(span);
              });
              td.appendChild(container);
            } else {
              td.textContent = '';
            }
          } else {
            td.textContent = (rowData[key] !== undefined && rowData[key] !== null) ? rowData[key] : '';
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    // Initialize DataTable with Node Statistics column configuration
    setTimeout(() => {
      currentDataTable = $('#detailTable').DataTable(getDataTableConfig('nodeStats'));
      currentTableType = 'nodeStats';
    }, 100);
  } else {
    console.log('[Table] showNodeStatistics updating existing table', nodeStats);
    // Just update the data without rebuilding
    if (!nodeStats || nodeStats.length === 0) {
      currentDataTable.clear().draw();
    } else {
      const tableData = nodeStats.map(node => {
        const devName = node.id?.devName || '';
        const devAddr = node.id?.devAddr || '';

        // 根據 selectedDate 決定顯示總計或特定日期數據
        let statsData;
        if (selectedDate) {
          // 顯示特定日期的數據
          const dailyStats = node.daily?.find(d => d.date === selectedDate);
          if (dailyStats) {
            statsData = {
              lossRate: dailyStats.lossRate,
              avgRSSI: dailyStats.avgRSSI,
              avgSNR: dailyStats.avgSNR,
              firstTime: dailyStats.firstTime,
              lastTime: dailyStats.lastTime,
              fcntSpan: dailyStats.fcntSpan,
              duplicatePackets: dailyStats.duplicatePackets,
              totalWithDuplicates: dailyStats.totalWithDuplicates,
              resetCount: dailyStats.resetCount,
              dataRatesUsed: dailyStats.dataRatesUsed || []
            };
          } else {
            // 該節點在選定日期沒有數據
            statsData = {
              lossRate: null,
              avgRSSI: null,
              avgSNR: null,
              firstTime: null,
              lastTime: null,
              fcntSpan: null,
              duplicatePackets: null,
              totalWithDuplicates: null,
              resetCount: null,
              dataRatesUsed: []
            };
          }
        } else {
          // 顯示總計數據
          statsData = {
            lossRate: node.total?.lossRate,
            avgRSSI: node.total?.avgRSSI,
            avgSNR: node.total?.avgSNR,
            firstTime: node.timeline?.firstTime,
            lastTime: node.timeline?.lastTime,
            fcntSpan: node.timeline?.fcntSpan,
            duplicatePackets: node.total?.duplicatePackets,
            totalWithDuplicates: node.total?.totalWithDuplicates,
            resetCount: node.total?.resetCount,
            dataRatesUsed: node.total?.dataRatesUsed || []
          };
        }

        // 例外顯示：若選了特定日期，只使用當日例外；未選日期才使用總覽例外
        let exceptionLabels = [];
        let exceptionTags = [];
        let exceptionNoteMap = {};
        if (selectedDate) {
          const dailyStats = node.daily?.find(d => d.date === selectedDate);
          if (dailyStats) {
            exceptionLabels = Array.isArray(dailyStats.exceptionLabels) ? dailyStats.exceptionLabels : [];
            exceptionTags = Array.isArray(dailyStats.exceptionTags) ? dailyStats.exceptionTags : [];
            exceptionNoteMap = dailyStats.exceptionNoteMap || {};
          }
          // 不回退到 total，避免「當日 normal 仍顯示總體例外」
        } else {
          exceptionLabels = (node.total && Array.isArray(node.total.exceptionLabels)) ? node.total.exceptionLabels : [];
          exceptionTags = (node.total && Array.isArray(node.total.exceptionTags)) ? node.total.exceptionTags : [];
          exceptionNoteMap = (node.total && node.total.exceptionNoteMap) ? node.total.exceptionNoteMap : {};
        }
        const exCodeMap = { resetCount: 'RST', maxGapMinutes: 'GAP', inactiveSinceMinutes: 'INACT' };
        const exColorMap = { resetCount: '#ff6b6b', maxGapMinutes: '#4dabf7', inactiveSinceMinutes: '#ffa94d' };
        function exceptionBadgesHTML(tags, labels, noteMap) {
          if (!labels || !labels.length) return '';
          const items = labels.map((label, i) => ({
            tag: tags[i],
            label,
            code: exCodeMap[tags[i]] || (label.length > 6 ? label.slice(0,6).toUpperCase() : label.toUpperCase()),
            notes: Array.isArray(noteMap && noteMap[tags[i]]) ? noteMap[tags[i]] : []
          }));
          const spans = items.map(it => {
            const tip = [it.label].concat(it.notes || []).join('&#10;');
            const color = exColorMap[it.tag] || '#ddd';
            return `<span title="${tip}" style="padding:1px 6px;border-radius:10px;font-size:12px;background:rgba(255,255,255,0.08);border:1px solid ${color};color:${color};margin-right:4px;display:inline-block;">${it.code}</span>`;
          }).join('');
          return `<div style="display:flex;flex-wrap:wrap;gap:4px;">${spans}</div>`;
        }
        return {
          devname: `<a href="#" class="devname-link" data-devname="${devName}" data-devaddr="${devAddr}">${devName}</a>`,
          devaddr: devAddr,
          lossRate: safeToFixed(statsData.lossRate, 2),
          exception: exceptionBadgesHTML(exceptionTags, exceptionLabels, exceptionNoteMap),
          avgRSSI: safeToFixed(statsData.avgRSSI, 2),
          avgSNR: safeToFixed(statsData.avgSNR, 2),
          firstUplinkTime: statsData.firstTime ? new Date(statsData.firstTime).toLocaleString() : '',
          lastUplinkTime: statsData.lastTime ? new Date(statsData.lastTime).toLocaleString() : '',
          fcntDelta: statsData.fcntSpan ?? '',
          duplicateCount: statsData.duplicatePackets ?? '',
          totalUplinkCount: statsData.totalWithDuplicates ?? '',
          fcntResetCount: statsData.resetCount ?? '',
          usedDataRate: Array.from(statsData.dataRatesUsed).join(', ')
        };
      });

      currentDataTable.clear();
      currentDataTable.rows.add(tableData); // Pass the corrected data structure
      currentDataTable.draw();
    }
  }
}

/**
 * Show Node Statistics for a specific date
 * @param {string} selectedDate - Date in YYYY-MM-DD format
 * @param {string} category - Filter type: 'normal', 'abnormal', 'exception'
 */
function showDateNodeStatistics(selectedDate, category) {
  // 從全域 analytics 取出指定日期該分類節點
  if (!window.getCurrentAnalytics) return;
  const analytics = window.getCurrentAnalytics();
  if (!analytics) return;
  const day = analytics.threshold.list.find(d => d.date === selectedDate);
  if (!day) { console.warn('[Table] No day data', selectedDate); return; }
  const names = new Set(day[category] || []);
  const nodes = analytics.perNode.filter(n => names.has(n.id.devName || n.id.devAddr));
  showNodeStatistics(nodes, selectedDate); // 傳遞日期參數以顯示該日期的數據
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

// Global variable to store node chart instance
let nodeTimeSeriesChart = null;

// Helper function to get time range filter from UI
function getTimeRangeFilter() {
  const startVal = document.getElementById('startDate')?.value;
  const endVal = document.getElementById('endDate')?.value;
  const filter = {};
  if (startVal) filter.start = new Date(startVal);
  if (endVal) filter.end = new Date(endVal);
  return filter;
}

// 將函數暴露到全域作用域
window.getTimeRangeFilter = getTimeRangeFilter;

// Helper function to filter records by time range
function applyTimeRangeFilter(records, timeFilter) {
  if (!timeFilter.start && !timeFilter.end) {
    console.log('[TimeFilter] No time filter applied');
    return records; // No time filter applied
  }
  
  console.log('[TimeFilter] Applying time filter:', {
    start: timeFilter.start?.toLocaleString(),
    end: timeFilter.end?.toLocaleString(),
    inputRecords: records.length
  });
  
  // Define getField helper for this scope
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // direct access first
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // case-insensitive fallback
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }
  
  const filteredRecords = records.filter(record => {
    const rawTime = getField(record, 'Time', 'Received');
    let recordTime;
    
    if (rawTime instanceof Date) {
      recordTime = rawTime;
    } else if (typeof rawTime === 'string') {
      recordTime = new Date(rawTime);
    } else {
      return false; // Skip records without valid time
    }
    
    if (isNaN(recordTime.getTime())) {
      return false; // Skip records with invalid time
    }
    
    // Apply time range filter
    if (timeFilter.start && recordTime < timeFilter.start) {
      return false;
    }
    if (timeFilter.end && recordTime > timeFilter.end) {
      return false;
    }
    
    return true;
  });
  
  const filteredCount = filteredRecords.length;
  console.log(`[TimeFilter] After filtering: ${filteredCount} records (${records.length - filteredCount} filtered out)`);
  
  return filteredRecords;
}

// Helper function for field access in time filtering
function getFieldForTimeFilter(obj, ...keys) {
  if (!obj) return undefined;
  // direct access first
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  // case-insensitive fallback
  const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

// Populate Node Charts with time series data for the selected node
function populateNodeCharts(devname, devaddr) {
  if (!window.getRawRecords) return;
  const recs = window.getRawRecords() || [];

  // Get time range filter from UI
  const timeFilter = getTimeRangeFilter();
  console.log('[Chart] Time filter applied:', timeFilter);

  // Normalize lookup values for comparison (trim + lower)
  const devnameKey = (devname || '').toString().trim().toLowerCase();
  const devaddrKey = (devaddr || '').toString().trim().toLowerCase();

  // flexible field getter: try multiple possible keys (case-insensitive)
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // direct access first
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // case-insensitive fallback
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  // Filter by device name/address first
  let filteredRecords = recs.filter(r => {
    const rn = (getField(r, 'Devname', 'DevName', 'Device Name') || '').toString().trim().toLowerCase();
    const ra = (getField(r, 'Devaddr', 'DevAddr') || '').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });

  // Apply time range filter
  filteredRecords = applyTimeRangeFilter(filteredRecords, timeFilter);

  // Sort records by time
  filteredRecords.sort((a, b) => {
    const timeA = getField(a, 'Time', 'Received');
    const timeB = getField(b, 'Time', 'Received');
    const dateA = timeA instanceof Date ? timeA : new Date(timeA);
    const dateB = timeB instanceof Date ? timeB : new Date(timeB);
    return dateA - dateB;
  });

  console.log(`[Chart] Filtered ${filteredRecords.length} total records for ${devname}`);

  // Prepare chart data
  const chartData = [];
  let uplinkCount = 0;
  let downlinkCount = 0;
  
  filteredRecords.forEach(r => {
    // 檢查是否為上行資料（只有上行資料才有 RSSI/SNR）
    const type = getField(r, 'Type', 'FrameType', 'Frame Type');
    const isUplink = type && (type.toString().toLowerCase().includes('up') || 
                             (typeof type === 'object' && type.isUp));
    
    if (isUplink) {
      uplinkCount++;
    } else {
      downlinkCount++;
      return; // 跳過下行資料
    }
    
    const rawTime = getField(r, 'Time', 'Received');
    let time;
    
    if (rawTime instanceof Date) {
      time = rawTime;
    } else if (typeof rawTime === 'string') {
      time = new Date(rawTime);
    } else {
      console.warn('[Chart] Invalid time format:', rawTime);
      return;
    }
    
    if (isNaN(time.getTime())) {
      console.warn('[Chart] Invalid date:', rawTime);
      return; // Skip invalid dates
    }
    
    const rssi = parseFloat(getField(r, 'RSSI', 'U/L RSSI'));
    const snr = parseFloat(getField(r, 'SNR', 'U/L SNR'));
    
    // 檢查是否為有效數值（包括負數和零）
    const validRSSI = !isNaN(rssi) ? rssi : null;
    const validSNR = !isNaN(snr) ? snr : null;
    
    const fcnt = getField(r, 'Fcnt', 'FCnt');
    const datarate = getField(r, 'Datarate', 'DatarateIndex') || '';
    const port = getField(r, 'Port') || '';
    const frequency = getField(r, 'Freq', 'Frequency') || '';
    
    // Only include records with valid RSSI or SNR
    if (validRSSI !== null || validSNR !== null) {
      chartData.push({
        time: time,
        timestamp: time.getTime(), // 新增時間戳記用於圖表 x 軸
        rssi: validRSSI,
        snr: validSNR,
        fcnt: fcnt,
        datarate: datarate,
        port: port,
        frequency: frequency,
        raw: r
      });
    }
  });

  console.log(`[Chart] Processed ${uplinkCount} uplink and ${downlinkCount} downlink records`);
  console.log(`[Chart] Prepared ${chartData.length} chart data points from uplink records`);
  if (chartData.length > 0) {
    console.log('[Chart] Sample data point:', chartData[0]);
  }

  // Destroy existing chart if it exists
  if (nodeTimeSeriesChart) {
    nodeTimeSeriesChart.destroy();
    nodeTimeSeriesChart = null;
  }

  // Create new chart
  let ctx = document.getElementById('nodeTimeSeriesChart');
  if (!ctx) {
    console.error('Chart canvas not found');
    return;
  }

  // Clear the container and restore canvas if needed
  const chartContainer = ctx.parentElement;
  if (!chartContainer.querySelector('canvas')) {
    chartContainer.innerHTML = '<canvas id="nodeTimeSeriesChart"></canvas>';
    ctx = document.getElementById('nodeTimeSeriesChart');
  }

  const rssiData = chartData.map(d => ({ x: d.timestamp, y: d.rssi, data: d })).filter(d => d.y !== null);
  const snrData = chartData.map(d => ({ x: d.timestamp, y: d.snr, data: d })).filter(d => d.y !== null);

  console.log(`[Chart] RSSI data points: ${rssiData.length}, SNR data points: ${snrData.length}`);

  // Check if we have any data to display
  if (rssiData.length === 0 && snrData.length === 0) {
    console.warn('[Chart] No valid RSSI or SNR data to display');
    // Show empty state message
    const chartContainer = ctx.parentElement;
    chartContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #aaa; font-style: italic;">沒有可顯示的 RSSI 或 SNR 數據</div>';
    return;
  }

  nodeTimeSeriesChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'RSSI (dBm)',
          data: rssiData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.1,
          yAxisID: 'y'
        },
        {
          label: 'SNR (dB)',
          data: snrData,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.1,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
      },
      plugins: {
        title: {
          display: true,
          text: `${devname} - RSSI & SNR 時序圖`,
          font: {
            size: 16
          },
          color: '#fff'
        },
        legend: {
          position: 'top',
          labels: {
            color: '#fff'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderWidth: 1,
          callbacks: {
            title: function(context) {
              if (context.length > 0) {
                const timestamp = context[0].parsed.x;
                const date = new Date(timestamp);
                return date.toLocaleString('zh-TW');
              }
              return '';
            },
            label: function(context) {
              const dataPoint = context.raw.data;
              let label = context.dataset.label + ': ' + context.parsed.y;
              
              // Add additional information
              const info = [];
              if (dataPoint.fcnt !== undefined && dataPoint.fcnt !== null) {
                info.push(`FCNT: ${dataPoint.fcnt}`);
              }
              if (dataPoint.datarate) {
                info.push(`DataRate: ${dataPoint.datarate}`);
              }
              if (dataPoint.port) {
                info.push(`Port: ${dataPoint.port}`);
              }
              if (dataPoint.frequency) {
                info.push(`Freq: ${dataPoint.frequency}`);
              }
              
              return [label, ...info];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          min: timeFilter.start ? timeFilter.start.getTime() : undefined,
          max: timeFilter.end ? timeFilter.end.getTime() : undefined,
          title: {
            display: true,
            text: '時間',
            color: '#fff'
          },
          ticks: {
            color: '#fff',
            maxTicksLimit: 8,
            callback: function(value, index) {
              // 將數值轉換回時間顯示
              const date = new Date(value);
              if (isNaN(date.getTime())) return '';
              return date.toLocaleString('zh-TW', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'RSSI (dBm)',
            color: 'rgb(75, 192, 192)'
          },
          ticks: {
            color: 'rgb(75, 192, 192)'
          },
          grid: {
            color: 'rgba(75, 192, 192, 0.1)'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'SNR (dB)',
            color: 'rgb(255, 99, 132)'
          },
          ticks: {
            color: 'rgb(255, 99, 132)'
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(255, 99, 132, 0.1)'
          }
        }
      }
    }
  });

  console.log(`[Chart] Created time series chart for ${devname} with ${chartData.length} data points`);

  // 將圖表實例暴露到全域，供 GAP overlay 使用
  try {
    window.nodeTimeSeriesChart = nodeTimeSeriesChart;
    window.getNodeTimeSeriesChart = () => nodeTimeSeriesChart;
  } catch(e) {}

  // 若 analytics 可用，套用 GAP overlay & 渲染 GAP tab
  try {
    if (window.getCurrentAnalytics) {
      const analytics = window.getCurrentAnalytics();
      if (analytics && Array.isArray(analytics.perNode)) {
        const node = analytics.perNode.find(n => (n.id.devName === devname) || (n.id.devAddr === devaddr));
        if (node) {
          // GAP 顯示控制
          const gapEnabled = document.getElementById('useNoDataDuration')?.checked;
          if (gapEnabled) {
            if (window.applyGapOverlayToTimeSeriesChart) window.applyGapOverlayToTimeSeriesChart(node);
            if (window.renderNodeGapCharts) window.renderNodeGapCharts(node);
            if (window.setGapOverlayEnabled) window.setGapOverlayEnabled(true);
          } else {
            // 停用 overlay 並清空目前已設定的區段
            if (window.setGapOverlayEnabled) window.setGapOverlayEnabled(false);
            if (window.nodeTimeSeriesChart) {
              window.nodeTimeSeriesChart.$gapSegments = [];
              window.nodeTimeSeriesChart.update();
            }
          }
        }
      }
    }
  } catch(e) { console.warn('[Chart] GAP overlay/render error', e); }
}

// Function to resize node chart
function resizeNodeChart() {
  if (nodeTimeSeriesChart) {
    nodeTimeSeriesChart.resize();
  }
}

// Populate Node DataTable with records related to the selected node
function populateNodeDataTable(devname, devaddr) {
  if (!window.getRawRecords) return;
  const recs = window.getRawRecords() || [];

  // Get time range filter from UI
  const timeFilter = getTimeRangeFilter();
  console.log('[Table] Time filter applied to node data:', timeFilter);

  // Normalize lookup values for comparison (trim + lower)
  const devnameKey = (devname || '').toString().trim().toLowerCase();
  const devaddrKey = (devaddr || '').toString().trim().toLowerCase();

  // flexible field getter: try multiple possible keys (case-insensitive)
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // direct access first
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // case-insensitive fallback
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  // Filter by device name/address first
  let filteredRecords = recs.filter(r => {
    const rn = (getField(r, 'Devname', 'DevName', 'Device Name') || '').toString().trim().toLowerCase();
    const ra = (getField(r, 'Devaddr', 'DevAddr') || '').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });

  // Apply time range filter
  filteredRecords = applyTimeRangeFilter(filteredRecords, timeFilter);

  // index.html defines 12 headers for #nodeDataTable. Produce rows with 12 entries to match.
  const tableData = filteredRecords.map(r => {
    // Received / Time
    const rawTime = getField(r, 'Time', 'Received');
    let received = '';
    let dateObj = null;
    if (rawTime instanceof Date) {
      dateObj = rawTime;
    } else if (typeof rawTime === 'string') {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) dateObj = d;
    }
    function formatYMDHMS(d) {
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    if (dateObj) {
      const epoch = dateObj.getTime();
      // 使用固定長度的 YYYY-MM-DD HH:mm:ss 以確保字串排序正確，並加 data-order 保障排序依 epoch
      received = `<span data-order="${epoch}">${formatYMDHMS(dateObj)}</span>`;
    }

    // Type (support either parsed FrameType object or raw Type string)
    let typeVal = '';
    const ft = getField(r, 'FrameType', 'Frame Type', 'Type');
    if (ft && typeof ft === 'object') {
      const isUp = !!ft.isUp;
      const confirmed = !!ft.confirmed;
      typeVal = (isUp ? 'Up' : 'Down') + ' / ' + (confirmed ? 'Confirmed' : 'Unconfirmed');
    } else if (typeof ft === 'string') {
      // try simple parse like Confirmed_Up or Unconfirmed_Down
      const parts = ft.split(/_|\s/).filter(Boolean);
      const confirmed = /^confirmed$/i.test(parts[0] || '');
      const isUp = /up/i.test(ft);
      typeVal = (isUp ? 'Up' : 'Down') + ' / ' + (confirmed ? 'Confirmed' : 'Unconfirmed');
    }

    // MAC can be array or joined string
    let mac = getField(r, 'Mac', 'MAC', 'DevEUI') || '';
    if (Array.isArray(mac)) {
      mac = mac.join('\n');
    }

    // RSSI / SNR numeric tolerant parsing
    function toNumberMaybe(v, isDownlink = false) {
      if (v === undefined || v === null || v === '') {
        return isDownlink ? 'N/A' : '';
      }
      if (typeof v === 'number') return isFinite(v) ? v : '';
      const n = Number(String(v).trim());
      return isFinite(n) ? n : (isDownlink ? 'N/A' : '');
    }

    // 檢查是否為下行資料
    const isDownlink = typeVal.toLowerCase().includes('down');
    
    const uplinkRssi = toNumberMaybe(getField(r, 'RSSI', 'U/L RSSI'), isDownlink);
    const uplinkSnr = toNumberMaybe(getField(r, 'SNR', 'U/L SNR'), isDownlink);
    const fcnt = toNumberMaybe(getField(r, 'Fcnt', 'FCnt'));
    const datarate = getField(r, 'Datarate', 'DatarateIndex') || '';

    // ACK may be boolean or string
    const ackRaw = getField(r, 'ACK');
    let ack = '';
    if (typeof ackRaw === 'boolean') ack = ackRaw ? 'true' : 'false';
    else if (typeof ackRaw === 'string') ack = (/^true$/i).test(ackRaw.trim()) ? 'true' : (/^false$/i).test(ackRaw.trim()) ? 'false' : '';

    const port = toNumberMaybe(getField(r, 'Port'));
    const freqRaw = getField(r, 'Freq', 'Frequency');
    const frequency = (freqRaw !== undefined && freqRaw !== null && freqRaw !== '') ? 
      (isFinite(Number(freqRaw)) ? Number(freqRaw).toFixed(1) : String(freqRaw)) : ''; // Format to 1 decimal place

    const macCommand = getField(r, 'MacCommand', 'MAC Command', 'Mac Cmd') || '';
    const data = getField(r, 'Data', 'Payload', 'Hex') || '';

    return [
      received,      // Received
      typeVal,       // Type
      mac,           // MAC
      uplinkRssi,    // U/L RSSI
      uplinkSnr,     // U/L SNR
      fcnt,          // FCnt
      datarate,      // Datarate
      ack,           // ACK
      port,          // Port
      frequency,     // Frequency
      macCommand,    // MAC Command
      data           // Data
    ];
  });
  
  const tableElement = document.querySelector('#nodeDataTable');
  if ($.fn.DataTable.isDataTable(tableElement)) {
    const dt = $(tableElement).DataTable();
    dt.clear();
    dt.rows.add(tableData);
    dt.draw();
  } else {
    // 使用與主表格相同的配置方法
    $(tableElement).DataTable({
      data: tableData,
      // Match headers in index.html (12 columns)
      columns: [
        { title: 'Received' },
        { title: 'Type' },
        { 
          title: 'MAC',
          className: 'wrap-data-column'
        },
        { title: 'U/L RSSI' },
        { title: 'U/L SNR' },
        { title: 'FCnt' },
        { title: 'Datarate' },
        { title: 'ACK' },
        { title: 'Port' },
        { title: 'Frequency' },
        { title: 'MAC Command' },
        { 
          title: 'Data',
          className: 'wrap-data-column-wide'
        }
      ],
      columnDefs: [
        // 數值欄位右對齊
        {
          targets: [3, 4, 5, 8, 9], // U/L RSSI, U/L SNR, FCnt, Port, Frequency
          className: 'dt-body-right'
        },
        // 時間和狀態欄位置中對齊
        {
          targets: [0, 1, 6, 7], // Received, Type, Datarate, ACK
          className: 'dt-body-center'
        },
        // MAC 欄位 - 置中對齊並允許換行
        {
          targets: [2], // MAC
          className: 'dt-body-center wrap-data-column'
        },
        // Data 欄位特殊處理 - 左對齊並允許換行，使用較寬的樣式
        {
          targets: [11], // Data
          className: 'dt-body-left wrap-data-column-wide'
        }
      ],
      scrollX: true,        // 啟用水平捲動
      scrollCollapse: true, // 內容變窄時收合捲動寬度
      autoWidth: false,     // 關掉自動計算寬度
      responsive: false,    // 關掉 responsive 避免衝突
      pageLength: -1,       // 👈 預設顯示全部資料
      lengthMenu: [[5, 10, 25, 50, 100, -1], [5, 10, 25, 50, 100, "All"]],
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
        // 確保表格寬度正確計算
        this.api().columns.adjust();
      },
      drawCallback: function() {
        // 每次重繪後重新調整欄寬
        this.api().columns.adjust();
      }
    });
  }
}

// Populate Basic Info tab with node statistics
function populateBasicInfo(devname, devaddr) {
  console.log('[BasicInfo] Populating basic info for:', devname, devaddr);
  
  // Set device info
  document.getElementById('basicDevname').textContent = devname || '-';
  document.getElementById('basicDevaddr').textContent = devaddr || '-';
  
  // Get time range filter
  const timeFilter = getTimeRangeFilter();
  const timeRangeText = getTimeRangeText(timeFilter);
  document.getElementById('basicTimeRange').textContent = timeRangeText;
  
  // Get filtered records to calculate basic statistics
  if (!window.getRawRecords) {
    console.warn('[BasicInfo] No getRawRecords function available');
    clearBasicInfo();
    return;
  }
  
  const recs = window.getRawRecords() || [];
  
  console.log(`[BasicInfo] Total raw records available: ${recs.length}`);
  if (recs.length > 0) {
    console.log('[BasicInfo] Sample record fields:', Object.keys(recs[0]));
  }
  
  // Normalize lookup values for comparison
  const devnameKey = (devname || '').toString().trim().toLowerCase();
  const devaddrKey = (devaddr || '').toString().trim().toLowerCase();
  
  console.log(`[BasicInfo] Looking for device: name="${devnameKey}", addr="${devaddrKey}"`);
  
  // Define getField helper for this scope
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // direct access first
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // case-insensitive fallback
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  // Filter by device name/address first
  let filteredRecords = recs.filter(r => {
    const rn = (getField(r, 'Devname', 'DevName', 'Device Name') || '').toString().trim().toLowerCase();
    const ra = (getField(r, 'Devaddr', 'DevAddr') || '').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });
  
  console.log(`[BasicInfo] Found ${filteredRecords.length} records for device ${devname}/${devaddr} before time filtering`);
  
  // Apply time range filter
  filteredRecords = applyTimeRangeFilter(filteredRecords, timeFilter);
  
  console.log(`[BasicInfo] Found ${filteredRecords.length} records for device ${devname}/${devaddr} after time filtering`);
  
  if (filteredRecords.length === 0) {
    console.warn('[BasicInfo] No records found after filtering');
    clearBasicInfo();
    return;
  }
  
  // Calculate basic statistics
  const stats = calculateBasicStats(filteredRecords);
  
  // Update UI elements
  document.getElementById('basicAvgRSSI').textContent = 
    stats.avgRSSI !== null ? `${stats.avgRSSI.toFixed(2)} dBm` : '-';
  document.getElementById('basicAvgSNR').textContent = 
    stats.avgSNR !== null ? `${stats.avgSNR.toFixed(2)} dB` : '-';
  document.getElementById('basicLossRate').textContent = 
    stats.lossRate !== null ? `${stats.lossRate.toFixed(2)}%` : '-';
  document.getElementById('basicTotalPackets').textContent = stats.totalPackets.toString();
  document.getElementById('basicDuplicatePackets').textContent = stats.duplicatePackets.toString();
  document.getElementById('basicResetCount').textContent = stats.resetCount.toString();
  document.getElementById('basicFirstTime').textContent = 
    stats.firstTime ? stats.firstTime.toLocaleString() : '-';
  document.getElementById('basicLastTime').textContent = 
    stats.lastTime ? stats.lastTime.toLocaleString() : '-';
}

// Helper function to clear basic info when no data available
function clearBasicInfo() {
  const fields = ['basicAvgRSSI', 'basicAvgSNR', 'basicLossRate', 
                 'basicTotalPackets', 'basicDuplicatePackets', 'basicResetCount',
                 'basicFirstTime', 'basicLastTime'];
  fields.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = '-';
  });
}

// Helper function to get time range text for display
function getTimeRangeText(timeFilter) {
  if (!timeFilter.start && !timeFilter.end) {
    return '全部資料';
  }
  
  const parts = [];
  if (timeFilter.start) {
    parts.push(`從 ${timeFilter.start.toLocaleString()}`);
  }
  if (timeFilter.end) {
    parts.push(`到 ${timeFilter.end.toLocaleString()}`);
  }
  
  return parts.join(' ');
}

// Calculate basic statistics from filtered records
function calculateBasicStats(records) {
  // Define getField helper for this scope
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // direct access first
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // case-insensitive fallback
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  let rssiSum = 0, rssiCount = 0;
  let snrSum = 0, snrCount = 0;
  let totalPackets = records.length;
  let duplicatePackets = 0;
  let resetCount = 0;
  let firstTime = null;
  let lastTime = null;
  let uplinkPackets = 0;
  let expectedPackets = 0;
  
  // Track FCnt for reset detection
  let lastFcnt = null;
  const fcnts = [];
  
  records.forEach(record => {
    // Time tracking
    const time = getField(record, 'Time', 'Received');
    const recordTime = time instanceof Date ? time : new Date(time);
    if (!isNaN(recordTime.getTime())) {
      if (!firstTime || recordTime < firstTime) firstTime = recordTime;
      if (!lastTime || recordTime > lastTime) lastTime = recordTime;
    }
    
    // Check if uplink
    const type = getField(record, 'Type', 'FrameType', 'Frame Type');
    const isUplink = type && (type.toString().toLowerCase().includes('up') || 
                             (typeof type === 'object' && type.isUp));
    
    if (isUplink) {
      uplinkPackets++;
      
      // RSSI/SNR for uplink packets only
      const rssi = parseFloat(getField(record, 'RSSI', 'U/L RSSI'));
      const snr = parseFloat(getField(record, 'SNR', 'U/L SNR'));
      
      if (!isNaN(rssi)) {
        rssiSum += rssi;
        rssiCount++;
      }
      if (!isNaN(snr)) {
        snrSum += snr;
        snrCount++;
      }
      
      // FCnt tracking for reset detection
      const fcnt = parseInt(getField(record, 'Fcnt', 'FCnt'));
      if (!isNaN(fcnt)) {
        fcnts.push(fcnt);
        if (lastFcnt !== null && fcnt < lastFcnt) {
          resetCount++;
        }
        lastFcnt = fcnt;
      }
    }
  });
  
  // Simple duplicate detection (this is a basic approximation)
  const fcntCounts = {};
  fcnts.forEach(fcnt => {
    fcntCounts[fcnt] = (fcntCounts[fcnt] || 0) + 1;
  });
  duplicatePackets = Object.values(fcntCounts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  
  // Calculate expected packets and loss rate
  if (fcnts.length > 1) {
    const minFcnt = Math.min(...fcnts);
    const maxFcnt = Math.max(...fcnts);
    expectedPackets = maxFcnt - minFcnt + 1;
  } else {
    expectedPackets = uplinkPackets;
  }
  
  const uniquePackets = uplinkPackets - duplicatePackets;
  const lostPackets = Math.max(0, expectedPackets - uniquePackets);
  const lossRate = expectedPackets > 0 ? (lostPackets / expectedPackets) * 100 : 0;
  
  return {
    avgRSSI: rssiCount > 0 ? rssiSum / rssiCount : null,
    avgSNR: snrCount > 0 ? snrSum / snrCount : null,
    lossRate: expectedPackets > 0 ? lossRate : null,
    totalPackets,
    duplicatePackets,
    resetCount,
    firstTime,
    lastTime,
    uplinkPackets,
    expectedPackets
  };
}

function initializeTableRelated() {
  initializeTable();

  // 點擊 Devname 連結時顯示 Overlay
  document.querySelector('#detailTable').addEventListener('click', (event) => {
      if (event.target.classList.contains('devname-link')) {
          event.preventDefault();
          const devname = event.target.dataset.devname;
          const devaddr = event.target.dataset.devaddr;

          // 更新 Overlay 標題和內容
          document.getElementById('overlayTitle').textContent = `Device: ${devname} (addr: ${devaddr})`;
          
          // 顯示當前的時間範圍篩選條件
          const timeRange = getTimeRangeFilter();
          const timeRangeElement = document.getElementById('overlayTimeRange');
          if (timeRangeElement) {
            if (timeRange.start || timeRange.end) {
              const parts = [];
              if (timeRange.start) {
                parts.push(`開始時間: ${timeRange.start.toLocaleString('zh-TW')}`);
              }
              if (timeRange.end) {
                parts.push(`結束時間: ${timeRange.end.toLocaleString('zh-TW')}`);
              }
              timeRangeElement.textContent = `時間篩選範圍 - ${parts.join(' | ')}`;
            } else {
              timeRangeElement.textContent = '時間篩選範圍 - 全部資料';
            }
          }

          // 顯示 Overlay
          document.getElementById('nodeOverlay').classList.remove('hidden');
          // Populate Basic Info
          populateBasicInfo(devname, devaddr);
          // Populate Node DataTable with records related to this node
          populateNodeDataTable(devname, devaddr);
          // Populate Node Charts with records related to this node
          populateNodeCharts(devname, devaddr);
          // Create Node Uplink Frequency Chart
          if (window.createNodeUpFreqChart) {
              window.createNodeUpFreqChart(devname, devaddr);
          }
          // Create Node Gateway Polar Chart
      if (window.createNodeGwBarChart) {
        window.createNodeGwBarChart(devname, devaddr);
          }
          // 初始化 GAP overlay checkbox 事件（僅綁一次）
          const gapCbx = document.getElementById('toggleGapOverlay');
          if (gapCbx && !gapCbx._gapBound) {
            gapCbx._gapBound = true;
            gapCbx.addEventListener('change', () => {
              if (window.setGapOverlayEnabled) window.setGapOverlayEnabled(gapCbx.checked);
            });
          }
      }
  });

  // 關閉 Overlay - 只保留點擊背景關閉的功能
  document.getElementById('nodeOverlay').addEventListener('click', (event) => {
      if (event.target.id === 'nodeOverlay') {
          document.getElementById('nodeOverlay').classList.add('hidden');
          // Clean up charts when closing overlay
          if (nodeTimeSeriesChart) {
            nodeTimeSeriesChart.destroy();
            nodeTimeSeriesChart = null;
          }
          if (window.destroyNodeUpFreqChart) {
            window.destroyNodeUpFreqChart();
          }
          if (window.destroyNodeGwBarChart) {
            window.destroyNodeGwBarChart();
          }
      }
  });

  // 切換 Tabs
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      // 移除所有按鈕的 active 狀態
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

      // 隱藏所有 tab 內容並移除 active 狀態
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
      });

      // 激活點擊的按鈕
      button.classList.add('active');

      // 顯示對應的 tab 內容
      const targetTab = document.getElementById(button.dataset.tab);
      if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('active');
      }

      // 如果切換到 nodeData tab，重新調整表格佈局
      if (button.dataset.tab === 'nodeData') {
        setTimeout(() => {
          const table = $('#nodeDataTable');
          if ($.fn.DataTable.isDataTable(table)) {
            const dt = table.DataTable();
            dt.columns.adjust().draw();
            // 確保 scrollX 正常運作
            dt.draw(false);
          }
        }, 150); // 稍微延長時間確保 tab 完全顯示
      }

      // 如果切換到 charts tab，重新調整圖表佈局
    if (button.dataset.tab === 'nodeSignalChart' || button.dataset.tab === 'chartsTabContent' || button.dataset.tab === 'nodeCharts') {
        setTimeout(() => {
          if (window.resizeNodeChart) {
            window.resizeNodeChart();
          }
        }, 150);
      }

      // 如果切換到 uplink frequency chart tab，重新調整頻率圖表佈局
      if (button.dataset.tab === 'nodeUpFreqChart') {
        setTimeout(() => {
          if (window.resizeNodeUpFreqChart) {
            window.resizeNodeUpFreqChart();
          }
        }, 150);
      }

      // 如果切換到 gateway polar chart tab，重新調整極座標圖表佈局
      if (button.dataset.tab === 'nodeGwChart') {
        setTimeout(() => {
          if (window.resizeNodeGwBarChart) {
            window.resizeNodeGwBarChart();
          }
        }, 150);
      }
    });
  });
};

window.populateNodeDataTable = populateNodeDataTable;
window.populateNodeCharts = populateNodeCharts;
window.populateBasicInfo = populateBasicInfo;
window.resizeNodeChart = resizeNodeChart;
window.initializeTableRelated = initializeTableRelated;
window.showNodeStatistics = showNodeStatistics;
window.showDateNodeStatistics = showDateNodeStatistics;
window.destroyCurrentTable = destroyCurrentTable;
window.clearNodeTable = destroyCurrentTable; // Alias for backward compatibility
window.initializeTable = initializeTable;
window.refreshTable = refreshTable;
window.getCurrentTable = getCurrentTable;
window.getCurrentTableType = getCurrentTableType;
window.isTableInitialized = isTableInitialized;

// Auto-resize node chart when window is resized
window.addEventListener('resize', () => {
  if (nodeTimeSeriesChart) {
    setTimeout(resizeNodeChart, 100); // Small delay to ensure proper sizing
  }
  if (window.resizeNodeUpFreqChart) {
    setTimeout(window.resizeNodeUpFreqChart, 100);
  }
  if (window.resizeNodeGwBarChart) {
    setTimeout(window.resizeNodeGwBarChart, 100);
  }
});

/**
 * Helper: safe formatting for numbers
 * @param {any} value - The value to format
 * @param {number} digits - Number of decimal places
 * @returns {string} Formatted number or empty string if invalid
 */
function safeToFixed(value, digits) {
  // Avoid calling toFixed on non-numeric values which would throw.
  const num = Number(value);
  const formatted = (value !== undefined && value !== null && isFinite(num)) ? num.toFixed(digits) : '';
  return formatted;
}