// Chart Manager (v2) - 使用 analytics.threshold.list 三分類 (normal/abnormal/exception)

let barChart; // Chart.js 實例
let nodeUpFreqChart; // 新增：節點上行頻率圖表實例
let nodeGwPolarChart; // 新增：節點接收器極座標圖表實例

function initializeChart() {
  console.log('[Chart] Manager ready');
}

/**
 * 將 analytics 轉成圖表資料並渲染
 * @param {AnalyticsContainer|Object} analytics - buildAnalytics 回傳的 analytics
 */
function renderBarChart(analytics) {
  if (!analytics || !analytics.threshold || !analytics.threshold.list) {
    console.warn('[Chart] No analytics.threshold.list to render');
    destroyChart();
    return;
  }
  console.log('[Chart] Rendering bar chart', analytics);
  const list = analytics.threshold.list.slice().sort((a,b)=> a.date.localeCompare(b.date));
  const labels = list.map(d => d.date);
  const normal = list.map(d => d.normalcnt);
  const abnormal = list.map(d => d.abnormalcnt);
  const exception = list.map(d => d.exceptioncnt);

  // 使用新的 threshold.total 資料（基於整體統計的正確分類）
  // 重要：Gap 等指標需要基於整個時間範圍重新計算，不能簡單聚合每日結果
  // - 每日統計：maxGapMinutes 是該日最大間隔
  // - Total 統計：maxGapMinutes 是整個期間所有記錄中的最大間隔
  // 因此 Total 和每日統計的分類結果可能會不同，這是正確的行為
  let totalNormal = 0, totalAbnormal = 0, totalException = 0;
  if (analytics.threshold.total) {
    totalNormal = analytics.threshold.total.normalcnt;
    totalAbnormal = analytics.threshold.total.abnormalcnt;
    totalException = analytics.threshold.total.exceptioncnt;
  } else {
    // 向後相容：如果沒有 total 欄位，則用每日聚合的計算方式
    const totalNormalDevices = new Set();
    const totalAbnormalDevices = new Set();
    const totalExceptionDevices = new Set();
    
    for (const day of list) {
      day.normal.forEach(device => totalNormalDevices.add(device));
      day.abnormal.forEach(device => totalAbnormalDevices.add(device));
      day.exception.forEach(device => totalExceptionDevices.add(device));
    }
    
    totalNormal = totalNormalDevices.size;
    totalAbnormal = totalAbnormalDevices.size;
    totalException = totalExceptionDevices.size;
  }
  
  labels.unshift('Total');
  normal.unshift(totalNormal);
  abnormal.unshift(totalAbnormal);
  exception.unshift(totalException);

  if (barChart) barChart.destroy();
  const ctx = document.getElementById('barChart').getContext('2d');
  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Normal', data: normal, backgroundColor: 'rgba(75,192,192,0.7)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1, stack: 'stack1' },
        { label: 'Abnormal', data: abnormal, backgroundColor: 'rgba(255,159,64,0.7)', borderColor: 'rgba(255,159,64,1)', borderWidth: 1, stack: 'stack1' },
        { label: 'Exception', data: exception, backgroundColor: 'rgba(255,99,132,0.7)', borderColor: 'rgba(255,99,132,1)', borderWidth: 1, stack: 'stack1' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true},
        legend: { position: 'top' }
      },
      scales: {
        x: { stacked: true, title: { display: true, text: 'Date' } },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Node Count' } }
      },
      onClick(evt, elems) {
        if (!elems.length) return;
        const elem = elems[0];
        const label = labels[elem.index];
        const datasetIdx = elem.datasetIndex; // 0 normal 1 abnormal 2 exception
        const category = datasetIdx === 0 ? 'normal' : datasetIdx === 1 ? 'abnormal' : 'exception';
        if (!window.getCurrentAnalytics) return;
        const analytics = window.getCurrentAnalytics();
        if (!analytics) return;
        let nodes = [];
        let selectedDate = null; // 新增：記錄選中的日期
        if (label === 'Total') {
          // Total: 使用 threshold.total 的資料（基於整體統計的正確分類）
          if (analytics.threshold.total) {
            const deviceNames = analytics.threshold.total[category] || [];
            const namesSet = new Set(deviceNames);
            nodes = analytics.perNode.filter(n => namesSet.has(n.id.devName || n.id.devAddr));
          } else {
            // 向後相容：從 threshold.list 聚合
            const namesSet = new Set();
            for (const day of analytics.threshold.list) {
              const arr = day[category];
              arr.forEach(n => namesSet.add(n));
            }
            nodes = analytics.perNode.filter(n => namesSet.has(n.id.devName || n.id.devAddr));
          }
          // Total 顯示總計數據，不傳遞日期
          selectedDate = null;
        } else {
          const dayItem = analytics.threshold.list.find(d => d.date === label);
          if (dayItem) {
            const dayNames = new Set(dayItem[category]);
            nodes = analytics.perNode.filter(n => dayNames.has(n.id.devName || n.id.devAddr));
            // 設定選中的日期
            selectedDate = label;
          }
        }
        if (typeof showNodeStatistics === 'function') {
          showNodeStatistics(nodes, selectedDate); // 傳遞日期參數
        }
      }
    }
  });
}

function updateChart(analytics) { renderBarChart(analytics); }

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
 * Create frequency distribution chart for a specific node
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address
 */
function createNodeUpFreqChart(devname, devaddr) {
  console.log('[Chart] Creating frequency chart for', devname, devaddr);
  
  // 取得目前的 analytics 資料
  if (!window.getCurrentAnalytics) {
    console.warn('[Chart] No getCurrentAnalytics function available');
    return;
  }
  
  const analytics = window.getCurrentAnalytics();
  if (!analytics || !analytics.perNode) {
    console.warn('[Chart] No analytics data available');
    return;
  }
  
  // 尋找對應的節點資料
  const node = analytics.perNode.find(n => 
    (n.id.devName && n.id.devName === devname) || 
    (n.id.devAddr && n.id.devAddr === devaddr)
  );
  
  if (!node) {
    console.warn('[Chart] Node not found in analytics:', devname, devaddr);
    return;
  }
  
  // 取得頻率統計資料
  const frequencyCounts = node.total.frequencyCounts;
  
  if (!frequencyCounts) {
    console.warn('[Chart] No frequency data available for node:', devname);
    showUpFreqChartEmptyState();
    return;
  }
  
  // 取得全域頻率基準 - 確保所有節點圖表使用相同的 x 軸
  const globalFrequencies = analytics.global.total.frequenciesUsed;
  
  if (!globalFrequencies || globalFrequencies.length === 0) {
    console.warn('[Chart] No global frequencies available');
    showUpFreqChartEmptyState();
    return;
  }
  
  // 準備圖表資料 - 顯示所有全域頻率，包括該節點未使用的（顯示為 0）
  const labels = [];
  const data = [];
  const backgroundColors = [];
  const borderColors = [];
  
  // 為每個全域頻率產生資料點
  globalFrequencies.forEach((freq, index) => {
    const freqKey = String(freq); // 轉換為字串作為 key
    const count = frequencyCounts[freqKey] || 0; // 未使用的頻率顯示為 0
    
    labels.push(`${freq} MHz`);
    data.push(count);
    
    // 使用單一色系，區分有使用和未使用的頻率
    if (count > 0) {
      // 有使用的頻率：藍色系
      backgroundColors.push('rgba(54, 162, 235, 0.7)');
      borderColors.push('rgba(54, 162, 235, 1)');
    } else {
      // 未使用的頻率：灰色系
      backgroundColors.push('rgba(200, 200, 200, 0.3)');
      borderColors.push('rgba(150, 150, 150, 0.6)');
    }
  });
  
  if (globalFrequencies.length === 0) {
    console.warn('[Chart] No frequency data to display');
    showUpFreqChartEmptyState();
    return;
  }
  
  // 銷毀現有圖表
  if (nodeUpFreqChart) {
    nodeUpFreqChart.destroy();
    nodeUpFreqChart = null;
  }
  
  // 取得 canvas 元素
  const ctx = document.getElementById('nodeUpFreqBarChart');
  if (!ctx) {
    console.error('[Chart] Frequency chart canvas not found');
    return;
  }
  
  // 建立新的柱狀圖
  nodeUpFreqChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '使用次數',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${devname} - 上行頻率使用分布`,
          font: { size: 16 },
          color: '#fff'
        },
        legend: {
          display: false // 隱藏圖例，因為只有一個資料集
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.3)',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const total = data.reduce((sum, val) => sum + val, 0);
              const count = context.parsed.y;
              const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
              const frequency = labels[context.dataIndex].replace(' MHz', '');
              
              if (count === 0) {
                return [
                  `頻率: ${frequency} MHz`,
                  `使用次數: 0`,
                  `此節點未使用此頻率`
                ];
              } else {
                return [
                  `頻率: ${frequency} MHz`,
                  `使用次數: ${count}`,
                  `接收率: ${percentage}%`
                ];
              }
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: '頻率 (MHz)',
            color: '#fff'
          },
          ticks: {
            color: '#fff',
            maxRotation: 45,
            minRotation: 0
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          title: {
            display: true,
            text: '使用次數',
            color: '#fff'
          },
          ticks: {
            color: '#fff',
            beginAtZero: true,
            precision: 0, // 整數顯示
            callback: function(value) {
              return Number.isInteger(value) ? value : '';
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      },
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          const element = elements[0];
          const frequency = labels[element.index].replace(' MHz', '');
          const count = data[element.index];
          console.log(`[Chart] Clicked frequency: ${frequency} MHz, count: ${count}`);
        }
      }
    }
  });
  
  console.log(`[Chart] Created frequency chart with ${globalFrequencies.length} frequency bands (showing all global frequencies)`);
}

/**
 * Update frequency distribution chart for a specific node
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address
 */
function updateNodeUpFreqChart(devname, devaddr) {
  // 如果圖表不存在，則創建新的
  if (!nodeUpFreqChart) {
    createNodeUpFreqChart(devname, devaddr);
    return;
  }
  
  console.log('[Chart] Updating frequency chart for', devname, devaddr);
  
  // 取得目前的 analytics 資料
  if (!window.getCurrentAnalytics) {
    console.warn('[Chart] No getCurrentAnalytics function available');
    return;
  }
  
  const analytics = window.getCurrentAnalytics();
  if (!analytics || !analytics.perNode) {
    console.warn('[Chart] No analytics data available');
    return;
  }
  
  // 尋找對應的節點資料
  const node = analytics.perNode.find(n => 
    (n.id.devName && n.id.devName === devname) || 
    (n.id.devAddr && n.id.devAddr === devaddr)
  );
  
  if (!node) {
    console.warn('[Chart] Node not found in analytics:', devname, devaddr);
    return;
  }
  
  // 取得頻率統計資料
  const frequencyCounts = node.total.frequencyCounts;
  
  if (!frequencyCounts) {
    console.warn('[Chart] No frequency data available for node:', devname);
    // 清空圖表
    nodeUpFreqChart.data.labels = [];
    nodeUpFreqChart.data.datasets[0].data = [];
    nodeUpFreqChart.data.datasets[0].backgroundColor = [];
    nodeUpFreqChart.data.datasets[0].borderColor = [];
    nodeUpFreqChart.update();
    return;
  }
  
  // 取得全域頻率基準 - 確保所有節點圖表使用相同的 x 軸
  const globalFrequencies = analytics.global.total.frequenciesUsed;
  
  if (!globalFrequencies || globalFrequencies.length === 0) {
    console.warn('[Chart] No global frequencies available');
    // 清空圖表
    nodeUpFreqChart.data.labels = [];
    nodeUpFreqChart.data.datasets[0].data = [];
    nodeUpFreqChart.data.datasets[0].backgroundColor = [];
    nodeUpFreqChart.data.datasets[0].borderColor = [];
    nodeUpFreqChart.update();
    return;
  }
  
  // 準備圖表資料 - 顯示所有全域頻率，包括該節點未使用的（顯示為 0）
  const labels = [];
  const data = [];
  const backgroundColors = [];
  const borderColors = [];
  
  // 為每個全域頻率產生資料點
  globalFrequencies.forEach((freq, index) => {
    const freqKey = String(freq); // 轉換為字串作為 key
    const count = frequencyCounts[freqKey] || 0; // 未使用的頻率顯示為 0
    
    labels.push(`${freq} MHz`);
    data.push(count);
    
    // 使用單一色系，區分有使用和未使用的頻率
    if (count > 0) {
      // 有使用的頻率：藍色系
      backgroundColors.push('rgba(54, 162, 235, 0.7)');
      borderColors.push('rgba(54, 162, 235, 1)');
    } else {
      // 未使用的頻率：灰色系
      backgroundColors.push('rgba(200, 200, 200, 0.3)');
      borderColors.push('rgba(150, 150, 150, 0.6)');
    }
  });
  
  // 更新圖表資料
  nodeUpFreqChart.data.labels = labels;
  nodeUpFreqChart.data.datasets[0].data = data;
  nodeUpFreqChart.data.datasets[0].backgroundColor = backgroundColors;
  nodeUpFreqChart.data.datasets[0].borderColor = borderColors;
  
  // 更新圖表標題
  nodeUpFreqChart.options.plugins.title.text = `${devname} - 上行頻率使用分布`;
  
  // 應用更新
  nodeUpFreqChart.update();
  
  console.log(`[Chart] Updated frequency chart with ${globalFrequencies.length} frequency bands`);
}

/**
 * Show empty state for frequency chart
 */
function showUpFreqChartEmptyState() {
  const chartContainer = document.getElementById('nodeUpFreqBarChart');
  if (chartContainer) {
    const container = chartContainer.parentElement;
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #aaa; font-style: italic;">沒有可顯示的頻率使用數據</div>';
  }
}

/**
 * Destroy node frequency chart
 */
function destroyNodeUpFreqChart() {
  if (nodeUpFreqChart) {
    nodeUpFreqChart.destroy();
    nodeUpFreqChart = null;
  }
}

/**
 * Resize node frequency chart
 */
function resizeNodeUpFreqChart() {
  if (nodeUpFreqChart) {
    nodeUpFreqChart.resize();
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

/**
 * Create gateway polar area chart for a specific node
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address
 */
function createNodeGwPolarChart(devname, devaddr) {
  console.log('[Chart] Creating gateway polar chart for', devname, devaddr);
  
  // 優先使用 analytics 數據結構
  if (window.getCurrentAnalytics) {
    const analytics = window.getCurrentAnalytics();
    if (analytics && analytics.perNode) {
      // 正規化設備名稱和地址用於比較
      const devnameKey = (devname || '').toString().trim().toLowerCase();
      const devaddrKey = (devaddr || '').toString().trim().toLowerCase();
      
      // 尋找對應的節點統計
      const nodeStats = analytics.perNode.find(node => {
        const nDevName = (node.id.devName || '').toString().trim().toLowerCase();
        const nDevAddr = (node.id.devAddr || '').toString().trim().toLowerCase();
        return nDevName === devnameKey || nDevAddr === devaddrKey || 
               nDevName === devaddrKey || nDevAddr === devnameKey;
      });
      
      if (nodeStats && nodeStats.total && nodeStats.total.gatewayCounts) {
        console.log('[Chart] Using analytics gateway data for', devname);
        
        // 從 analytics 數據中獲取 gateway 統計
        const gatewayCounts = nodeStats.total.gatewayCounts;
        const gatewayCount = new Map();
        
        // 轉換 gatewayCounts 對象為 Map
        for (const [gateway, count] of Object.entries(gatewayCounts)) {
          if (count > 0) {
            gatewayCount.set(gateway, count);
          }
        }
        
        console.log('[Chart] Gateway count map from analytics:', gatewayCount);
        
        if (gatewayCount.size === 0) {
          showGwPolarChartEmptyState();
          return;
        }
        
        // 使用 analytics 數據創建圖表
        createPolarChartFromGatewayData(devname, devaddr, gatewayCount, nodeStats.total.totalWithDuplicates);
        return;
      }
    }
  }
  
  // 回退到原始記錄資料處理（保持兼容性）
  console.log('[Chart] Falling back to raw records processing');
  
  if (!window.getRawRecords) {
    console.warn('[Chart] No getRawRecords function available');
    return;
  }
  
  const rawRecords = window.getRawRecords() || [];
  
  // 正規化設備名稱和地址用於比較
  const devnameKey = (devname || '').toString().trim().toLowerCase();
  const devaddrKey = (devaddr || '').toString().trim().toLowerCase();
  
  // flexible field getter: 嘗試多種可能的鍵值（不區分大小寫）
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // 直接存取
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // 不區分大小寫的回退
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }
  
  // 篩選該節點的記錄
  const filteredRecords = rawRecords.filter(r => {
    const rn = (getField(r, 'Devname', 'DevName', 'Device Name') || '').toString().trim().toLowerCase();
    const ra = (getField(r, 'Devaddr', 'DevAddr') || '').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });
  
  console.log(`[Chart] Found ${filteredRecords.length} records for ${devname}`);
  
  if (filteredRecords.length === 0) {
    showGwPolarChartEmptyState();
    return;
  }
  
  // 從 MAC 欄位提取接收器資訊
  const gatewayCount = new Map(); // Map<gateway, count>
  const perGatewaySeenMsg = new Map(); // Map<gateway, Set<msgId>> 避免重複計數
  
  filteredRecords.forEach(record => {
    // 取得 MAC 欄位（可能是陣列或字串）
    let mac = getField(record, 'Mac', 'MAC', 'DevEUI') || '';
    
    // 如果是陣列，轉換為字串陣列
    let macArray = [];
    if (Array.isArray(mac)) {
      macArray = mac;
    } else if (typeof mac === 'string' && mac.trim()) {
      // 如果是字串，按換行符號分割
      macArray = mac.split('\n').map(m => m.trim()).filter(m => m);
    }
    
    // 取得 FCnt 作為訊息 ID
    const fcnt = getField(record, 'Fcnt', 'FCnt');
    const msgId = fcnt ? `${devaddr}_${fcnt}` : `${devaddr}_${Date.now()}_${Math.random()}`;
    
    // 為每個接收器（MAC）增加計數
    macArray.forEach(gatewayMac => {
      if (!gatewayMac) return;
      
      // 確保接收器存在於 Map 中
      if (!gatewayCount.has(gatewayMac)) {
        gatewayCount.set(gatewayMac, 0);
        perGatewaySeenMsg.set(gatewayMac, new Set());
      }
      
      // 避免同一接收器對同一訊息重複計數
      const seen = perGatewaySeenMsg.get(gatewayMac);
      if (!seen.has(msgId)) {
        seen.add(msgId);
        gatewayCount.set(gatewayMac, gatewayCount.get(gatewayMac) + 1);
      }
    });
  });
  
  console.log('[Chart] Gateway count map from raw records:', gatewayCount);
  
  if (gatewayCount.size === 0) {
    showGwPolarChartEmptyState();
    return;
  }
  
  // 使用原始數據創建圖表（計算總數）
  const totalWithDuplicates = filteredRecords.length;
  createPolarChartFromGatewayData(devname, devaddr, gatewayCount, totalWithDuplicates);
}

/**
 * Create polar chart from gateway data (共用邏輯)
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address  
 * @param {Map} gatewayCount - Map<gateway, count>
 * @param {number} totalWithDuplicates - Total packet count for percentage calculation
 */
function createPolarChartFromGatewayData(devname, devaddr, gatewayCount, totalWithDuplicates) {
  // 準備圖表資料
  const labels = [];
  const data = [];
  const backgroundColors = [];
  
  // 轉換為陣列並排序
  const gatewayEntries = Array.from(gatewayCount.entries()).sort((a, b) => b[1] - a[1]);
  
  gatewayEntries.forEach(([gateway, count], index) => {
    // 改善 Gateway 名稱顯示方式
    let shortName;
    if (gateway.length <= 12) {
      shortName = gateway; // 短名稱直接顯示
    } else {
      // 對於長名稱，顯示前6個字元 + ... + 最後6個字元
      shortName = gateway;
    }
    labels.push(shortName);
    data.push(count);
    
    // 依值動態著色
    const hue = (index * 137.5) % 360; // 使用黃金角度分佈顏色
    const saturation = Math.min(85, 50 + (count / Math.max(...gatewayEntries.map(e => e[1]))) * 35);
    const lightness = Math.min(70, 45 + (count / Math.max(...gatewayEntries.map(e => e[1]))) * 25);
    backgroundColors.push(`hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`);
  });
  
  // 銷毀現有圖表
  if (nodeGwPolarChart) {
    nodeGwPolarChart.destroy();
    nodeGwPolarChart = null;
  }
  
  // 取得 canvas 元素
  const ctx = document.getElementById('nodeGwPolarChart');
  if (!ctx) {
    console.error('[Chart] Gateway polar chart canvas not found');
    return;
  }
  
  // 建立極座標圖表
  nodeGwPolarChart = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: labels,
      datasets: [{
        label: '接收次數',
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${devname} - Gateway 接收分布`,
          font: { size: 16 },
          color: '#fff'
        },
        legend: {
          position: 'top',
          labels: {
            color: '#fff', // 確保圖例文字為白色
            font: { size: 12 }, // 增加字體大小便於閱讀
            generateLabels: function(chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const value = data.datasets[0].data[i];
                  const percentage = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
                  // 使用完整的 Gateway 名稱在圖例中（如果名稱太長會自動換行）
                  const fullGatewayName = gatewayEntries[i][0];
                  const displayName = fullGatewayName.length > 20 ? 
                    fullGatewayName.slice(0, 10) + '...' + fullGatewayName.slice(-7) : 
                    fullGatewayName;
                  
                  return {
                    text: `${displayName}: ${value} (${percentage}%)`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    strokeStyle: '#fff', // 確保邊框為白色
                    fontColor: '#fff', // 明確設定字體顏色為白色
                    lineWidth: 1,
                    index: i
                  };
                });
              }
              return [];
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.9)', // 增加透明度
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.5)', // 增加邊框透明度
          borderWidth: 1,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            title: function(context) {
              // 在 tooltip 標題顯示完整的 Gateway 名稱
              if (context.length > 0) {
                const fullGatewayName = gatewayEntries[context[0].dataIndex][0];
                return `Gateway: ${fullGatewayName}`;
              }
              return '';
            },
            label: function(context) {
              // context.parsed 是當前資料點的值
              const value = context.parsed.r;
              const percentage = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
              
              return [
                `接收次數: ${value}`,
                `接收率: ${percentage}%`,
                `排名: #${context.dataIndex + 1}`
              ];
            },
            footer: function(context) {
              // 可選：在 footer 顯示額外資訊
              if (context.length > 0) {
                return `(應接收次數: ${totalWithDuplicates})`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          angleLines: { 
            display: true, 
            color: 'rgba(255, 255, 255, 0.2)' // 增加透明度讓線條更明顯
          },
          grid: { 
            circular: true, 
            color: 'rgba(255, 255, 255, 0.2)' // 增加透明度讓格線更明顯
          },
          pointLabels: {
            color: '#fff', // 確保角度標籤為白色
            font: { 
              size: 12, // 增加字體大小
              weight: 'bold' // 加粗字體便於閱讀
            },
            // 自定義點標籤顯示，處理長名稱
            callback: function(label, index) {
              // 如果標籤太長，在這裡進一步處理顯示
              if (label.length > 15) {
                return label.slice(0, 12) + '...';
              }
              return label;
            }
          },
          ticks: {
            z: 1, // 確保刻度文字繪製在 dataset 弧形之上
            backdropColor: '#ffffffd5', // 純白，不透明
            color: '#000000',         // 文字顏色（黑）
            font: { size: 11 },
            stepSize: Math.max(1, Math.ceil(Math.max(...data) / 5)),
            callback: function(value) {
              return Number.isInteger(value) ? value : '';
            }
          }
        }
      },
      onClick: function(evt, elements) {
        if (elements.length > 0) {
          const element = elements[0];
          const gatewayName = gatewayEntries[element.index][0];
          const count = gatewayEntries[element.index][1];
          console.log(`[Chart] Clicked gateway: ${gatewayName}, count: ${count}`);
        }
      }
    }
  });
  
  console.log(`[Chart] Created gateway polar chart with ${gatewayCount.size} gateways`);
}

/**
 * Show empty state for gateway polar chart
 */
function showGwPolarChartEmptyState() {
  const chartContainer = document.getElementById('nodeGwPolarChart');
  if (chartContainer) {
    const container = chartContainer.parentElement;
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 400px; color: #aaa; font-style: italic;">沒有可顯示的 Gateway 接收數據</div>';
  }
}

/**
 * Update node gateway polar chart with new time filter
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address
 */
function updateNodeGwPolarChart(devname, devaddr) {
  // 如果圖表不存在，則創建新的
  if (!nodeGwPolarChart) {
    createNodeGwPolarChart(devname, devaddr);
    return;
  }
  
  console.log('[Chart] Updating gateway polar chart for', devname, devaddr);
  
  // 優先使用 analytics 數據結構
  if (window.getCurrentAnalytics) {
    const analytics = window.getCurrentAnalytics();
    if (analytics && analytics.perNode) {
      // 正規化設備名稱和地址用於比較
      const devnameKey = (devname || '').toString().trim().toLowerCase();
      const devaddrKey = (devaddr || '').toString().trim().toLowerCase();
      
      // 尋找對應的節點統計
      const nodeStats = analytics.perNode.find(node => {
        const nDevName = (node.id.devName || '').toString().trim().toLowerCase();
        const nDevAddr = (node.id.devAddr || '').toString().trim().toLowerCase();
        return nDevName === devnameKey || nDevAddr === devaddrKey || 
               nDevName === devaddrKey || nDevAddr === devnameKey;
      });
      
      if (nodeStats && nodeStats.total && nodeStats.total.gatewayCounts) {
        console.log('[Chart] Using analytics gateway data for update', devname);
        
        // 從 analytics 數據中獲取 gateway 統計
        const gatewayCounts = nodeStats.total.gatewayCounts;
        const gatewayCount = new Map();
        
        // 轉換 gatewayCounts 對象為 Map
        for (const [gateway, count] of Object.entries(gatewayCounts)) {
          if (count > 0) {
            gatewayCount.set(gateway, count);
          }
        }
        
        console.log('[Chart] Gateway count map from analytics (update):', gatewayCount);
        
        if (gatewayCount.size === 0) {
          // 如果沒有接收器資料，清空圖表
          nodeGwPolarChart.data.labels = [];
          nodeGwPolarChart.data.datasets[0].data = [];
          nodeGwPolarChart.data.datasets[0].backgroundColor = [];
          nodeGwPolarChart.update();
          return;
        }
        
        // 使用 analytics 數據更新圖表
        updatePolarChartWithGatewayData(devname, devaddr, gatewayCount, nodeStats.total.totalWithDuplicates);
        return;
      }
    }
  }
  
  // 回退到原始記錄資料處理（保持兼容性）
  console.log('[Chart] Falling back to raw records processing for update');
  
  if (!window.getRawRecords) {
    console.warn('[Chart] No getRawRecords function available');
    return;
  }
  
  const rawRecords = window.getRawRecords() || [];
  
  // 正規化設備名稱和地址用於比較
  const devnameKey = (devname || '').toString().trim().toLowerCase();
  const devaddrKey = (devaddr || '').toString().trim().toLowerCase();
  
  // flexible field getter: 嘗試多種可能的鍵值（不區分大小寫）
  function getField(obj, ...keys) {
    if (!obj) return undefined;
    // 直接存取
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    // 不區分大小寫的回退
    const lowerMap = Object.keys(obj).reduce((acc, k) => { acc[k.toLowerCase()] = obj[k]; return acc; }, {});
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }
  
  // 篩選該節點的記錄
  const filteredRecords = rawRecords.filter(r => {
    const rn = (getField(r, 'Devname', 'DevName', 'Device Name') || '').toString().trim().toLowerCase();
    const ra = (getField(r, 'Devaddr', 'DevAddr') || '').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });
  
  console.log(`[Chart] Found ${filteredRecords.length} records for ${devname} (update)`);
  
  if (filteredRecords.length === 0) {
    // 如果沒有資料，清空圖表
    nodeGwPolarChart.data.labels = [];
    nodeGwPolarChart.data.datasets[0].data = [];
    nodeGwPolarChart.data.datasets[0].backgroundColor = [];
    nodeGwPolarChart.update();
    return;
  }
  
  // 從 MAC 欄位提取接收器資訊
  const gatewayCount = new Map(); // Map<gateway, count>
  const perGatewaySeenMsg = new Map(); // Map<gateway, Set<msgId>> 避免重複計數
  
  filteredRecords.forEach(record => {
    // 取得 MAC 欄位（可能是陣列或字串）
    let mac = getField(record, 'Mac', 'MAC', 'DevEUI') || '';
    
    // 如果是陣列，轉換為字串陣列
    let macArray = [];
    if (Array.isArray(mac)) {
      macArray = mac;
    } else if (typeof mac === 'string' && mac.trim()) {
      // 如果是字串，按換行符號分割
      macArray = mac.split('\n').map(m => m.trim()).filter(m => m);
    }
    
    // 取得 FCnt 作為訊息 ID
    const fcnt = getField(record, 'Fcnt', 'FCnt');
    const msgId = fcnt ? `${devaddr}_${fcnt}` : `${devaddr}_${Date.now()}_${Math.random()}`;
    
    // 為每個接收器（MAC）增加計數
    macArray.forEach(gatewayMac => {
      if (!gatewayMac) return;
      
      // 確保接收器存在於 Map 中
      if (!gatewayCount.has(gatewayMac)) {
        gatewayCount.set(gatewayMac, 0);
        perGatewaySeenMsg.set(gatewayMac, new Set());
      }
      
      // 避免同一接收器對同一訊息重複計數
      const seen = perGatewaySeenMsg.get(gatewayMac);
      if (!seen.has(msgId)) {
        seen.add(msgId);
        gatewayCount.set(gatewayMac, gatewayCount.get(gatewayMac) + 1);
      }
    });
  });
  
  console.log('[Chart] Gateway count map from raw records (update):', gatewayCount);
  
  if (gatewayCount.size === 0) {
    // 如果沒有接收器資料，清空圖表
    nodeGwPolarChart.data.labels = [];
    nodeGwPolarChart.data.datasets[0].data = [];
    nodeGwPolarChart.data.datasets[0].backgroundColor = [];
    nodeGwPolarChart.update();
    return;
  }
  
  // 使用原始數據更新圖表（計算總數）
  const totalWithDuplicates = filteredRecords.length;
  updatePolarChartWithGatewayData(devname, devaddr, gatewayCount, totalWithDuplicates);
}

/**
 * Update polar chart with gateway data (共用邏輯)
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address  
 * @param {Map} gatewayCount - Map<gateway, count>
 * @param {number} totalWithDuplicates - Total packet count for percentage calculation
 */
function updatePolarChartWithGatewayData(devname, devaddr, gatewayCount, totalWithDuplicates) {
  // 準備新的圖表資料
  const labels = [];
  const data = [];
  const backgroundColors = [];
  
  // 轉換為陣列並排序
  const gatewayEntries = Array.from(gatewayCount.entries()).sort((a, b) => b[1] - a[1]);
  
  gatewayEntries.forEach(([gateway, count], index) => {
    // 改善 Gateway 名稱顯示方式
    let shortName;
    if (gateway.length <= 12) {
      shortName = gateway; // 短名稱直接顯示
    } else {
      // 對於長名稱，顯示前6個字元 + ... + 最後6個字元
      shortName = gateway;
    }
    labels.push(shortName);
    data.push(count);
    
    // 依值動態著色
    const hue = (index * 137.5) % 360; // 使用黃金角度分佈顏色
    const saturation = Math.min(85, 50 + (count / Math.max(...gatewayEntries.map(e => e[1]))) * 35);
    const lightness = Math.min(70, 45 + (count / Math.max(...gatewayEntries.map(e => e[1]))) * 25);
    backgroundColors.push(`hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`);
  });
  
  // 更新圖表資料
  nodeGwPolarChart.data.labels = labels;
  nodeGwPolarChart.data.datasets[0].data = data;
  nodeGwPolarChart.data.datasets[0].backgroundColor = backgroundColors;
  
  // 更新圖表標題
  nodeGwPolarChart.options.plugins.title.text = `${devname} - Gateway 接收分布`;
  
  // 更新圖表刻度配置
  nodeGwPolarChart.options.scales.r.ticks.stepSize = Math.max(1, Math.ceil(Math.max(...data) / 5));
  
  // 更新 tooltip 回調中的 gatewayEntries 引用
  nodeGwPolarChart.options.plugins.tooltip.callbacks.title = function(context) {
    if (context.length > 0) {
      const fullGatewayName = gatewayEntries[context[0].dataIndex][0];
      return `Gateway: ${fullGatewayName}`;
    }
    return '';
  };
  
  // 更新 tooltip label 回調
  nodeGwPolarChart.options.plugins.tooltip.callbacks.label = function(context) {
    const value = context.parsed.r;
    const percentage = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
    
    return [
      `接收次數: ${value}`,
      `接收率: ${percentage}%`,
      `排名: #${context.dataIndex + 1}`
    ];
  };
  
  // 更新 tooltip footer 回調
  nodeGwPolarChart.options.plugins.tooltip.callbacks.footer = function(context) {
    if (context.length > 0) {
      return `(應接收次數: ${totalWithDuplicates})`;
    }
    return '';
  };
  
  // 更新圖例生成邏輯
  nodeGwPolarChart.options.plugins.legend.labels.generateLabels = function(chart) {
    const data = chart.data;
    if (data.labels.length && data.datasets.length) {
      return data.labels.map((label, i) => {
        const value = data.datasets[0].data[i];
        const percentage = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
        // 使用完整的 Gateway 名稱在圖例中（如果名稱太長會自動換行）
        const fullGatewayName = gatewayEntries[i][0];
        const displayName = fullGatewayName.length > 20 ? 
          fullGatewayName.slice(0, 10) + '...' + fullGatewayName.slice(-7) : 
          fullGatewayName;
        
        return {
          text: `${displayName}: ${value} (${percentage}%)`,
          fillStyle: data.datasets[0].backgroundColor[i],
          strokeStyle: '#fff', // 確保邊框為白色
          fontColor: '#fff', // 明確設定字體顏色為白色
          lineWidth: 1,
          index: i
        };
      });
    }
    return [];
  };
  
  // 應用更新
  nodeGwPolarChart.update();
  
  console.log(`[Chart] Updated gateway polar chart with ${gatewayCount.size} gateways`);
}

/**
 * Destroy node gateway polar chart
 */
function destroyNodeGwPolarChart() {
  if (nodeGwPolarChart) {
    nodeGwPolarChart.destroy();
    nodeGwPolarChart = null;
  }
}

/**
 * Resize node gateway polar chart
 */
function resizeNodeGwPolarChart() {
  if (nodeGwPolarChart) {
    nodeGwPolarChart.resize();
  }
}

// Auto-resize chart when window is resized
window.addEventListener('resize', () => {
  if (isChartInitialized()) {
    setTimeout(resizeChart, 100); // Small delay to ensure proper sizing
  }
  if (nodeUpFreqChart) {
    setTimeout(resizeNodeUpFreqChart, 100);
  }
  if (nodeGwPolarChart) {
    setTimeout(resizeNodeGwPolarChart, 100);
  }
});

// Initialize chart manager when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeChart);

// Export functions to global scope for access from other modules
if (typeof window !== 'undefined') {
  window.renderBarChart = renderBarChart;
  window.updateChart = updateChart;
  window.destroyChart = destroyChart;
  window.clearBarChart = destroyChart; // Alias for backward compatibility
  window.getChartInstance = getChartInstance;
  window.isChartInitialized = isChartInitialized;
  window.resizeChart = resizeChart;
  window.createNodeUpFreqChart = createNodeUpFreqChart;
  window.updateNodeUpFreqChart = updateNodeUpFreqChart;
  window.destroyNodeUpFreqChart = destroyNodeUpFreqChart;
  window.resizeNodeUpFreqChart = resizeNodeUpFreqChart;
  window.createNodeGwPolarChart = createNodeGwPolarChart;
  window.updateNodeGwPolarChart = updateNodeGwPolarChart;
  window.destroyNodeGwPolarChart = destroyNodeGwPolarChart;
  window.resizeNodeGwPolarChart = resizeNodeGwPolarChart;
}
