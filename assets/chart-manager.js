// Chart Manager (v2) - 使用 analytics.threshold.list 三分類 (normal/abnormal/exception)

let barChart; // Chart.js 實例
let nodeUpFreqChart; // 新增：節點上行頻率圖表實例
let nodeGwBarChart; // Gateway 分布圖表實例（bar）
let nodeGapTimelineChart; // GAP 時間軸圖
let nodeDailyGapBarChart; // 每日最大 GAP 圖
let gapOverlayEnabled = true; // RSSI/SNR 圖表疊層開關
let gapOverlayMeta = { segments: [] }; // 儲存目前節點 GAP 區段 (timestamp pair)
let nodeParsedDataChart; // 解析後 payload 數據圖表實例

// 統一 GAP 分鐘顯示格式：整數不帶小數，否則顯示到小數第 2 位
function formatGapMinutes(val) {
  if (val == null || isNaN(val)) return '-';
  const rounded = Math.round((val + Number.EPSILON) * 100) / 100; // 2 位四捨五入
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

// 將分鐘轉成人類可讀 (支援天/小時/分鐘/秒)；僅在 >=60 分時加入分段
function formatGapHuman(minutes) {
  if (minutes == null || isNaN(minutes)) return '-';
  const totalMs = minutes * 60000;
  const totalSec = Math.floor(totalMs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(d + 'd');
  if (h) parts.push(h + 'h');
  if (m) parts.push(m + 'm');
  if (!d && !h && !m && s) parts.push(s + 's'); // 小於 1 分顯示秒
  return parts.length ? parts.join(' ') : '0m';
}

// 確保註冊『應接收總數』水平虛線插件（使虛線覆蓋整個 x 軸寬度並加上文字）
function ensureExpectedLinePluginRegistered() {
  if (typeof Chart === 'undefined') return; // Chart.js 尚未載入
  // 如果已經註冊過就跳過
  if (Chart.registry && Chart.registry.plugins.get('expectedTotalLine')) return;
  Chart.register({
    id: 'expectedTotalLine',
    afterDatasetsDraw(chart) {
      // 僅處理包含 isExpectedLine dataset 的圖 (我們用隱藏 dataset 作為旗標)
      const ds = chart.data && chart.data.datasets && chart.data.datasets.find(d => d.isExpectedLine);
      if (!ds) return;
      const expectedValue = chart.$expectedTotal || (Array.isArray(ds.data) ? ds.data[0] : null);
      if (!(expectedValue > 0)) return;
      const yScale = chart.scales && (chart.scales['y'] || Object.values(chart.scales).find(s => s.axis === 'y'));
      if (!yScale) return;
      const y = yScale.getPixelForValue(expectedValue);
      const area = chart.chartArea;
      if (!area) return;
      const { left, right, top, bottom } = area;
      if (y < top - 5 || y > bottom + 5) return; // 超出範圍不畫
      const ctx = chart.ctx;
      ctx.save();
      // 畫虛線（全寬）
      ctx.setLineDash([6,6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();

      // 標註文字
      const label = `應接收總數 ${expectedValue}`;
      ctx.font = '12px sans-serif';
      ctx.textBaseline = 'middle';
      const textWidth = ctx.measureText(label).width;
  const chartWidth = right - left;
  let textX = left + (chartWidth - textWidth) / 2; // 水平置中
  textX = Math.max(left + 4, Math.min(textX, right - textWidth - 4)); // 邊界保護
  let textY = y - 10; // 預設線上方
      // 若接近頂部則放到線下方
      if (textY < (top + 12)) textY = y + 12;
      // 背景框
      const paddingX = 4, paddingY = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(textX - paddingX, textY - (10/2) - paddingY, textWidth + paddingX*2, 10 + paddingY*2);
      // 文字
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText(label, textX, textY);
      ctx.restore();
    }
  });
}

function initializeChart() {
  console.log('[Chart] Manager ready');
}

// ---- GAP 視覺化相關 ----
// 1) 時序 RSSI/SNR 圖 Overlay Plugin：畫出 gap 區段半透明背景
function ensureGapOverlayPluginRegistered() {
  if (typeof Chart === 'undefined') return;
  if (Chart.registry && Chart.registry.plugins.get('gapOverlay')) return;
  Chart.register({
    id: 'gapOverlay',
    beforeDatasetsDraw(chart, args, opts) {
      if (!gapOverlayEnabled) return;
      const metaSegs = chart.$gapSegments || [];
      if (!metaSegs.length) return;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y; // 取任一 y 畫滿高度
      if (!xScale || !yScale) return;
      const ctx = chart.ctx;
      const area = chart.chartArea;
      if (!area) return;
      ctx.save();
      metaSegs.forEach(seg => {
        const [a, b] = seg; // number timestamp
        if (a == null || b == null) return;
        const left = xScale.getPixelForValue(a);
        const right = xScale.getPixelForValue(b);
        if (right < area.left || left > area.right) return; // 不在範圍
        const clampedLeft = Math.max(left, area.left);
        const clampedRight = Math.min(right, area.right);
        if (clampedRight - clampedLeft < 2) return;
        // 填滿區域
  ctx.fillStyle = 'rgba(80,170,255,0.18)'; // 淺藍色半透明 (GAP 區段)
  ctx.fillRect(clampedLeft, area.top, clampedRight - clampedLeft, area.bottom - area.top);
  // 邊界線
  ctx.strokeStyle = 'rgba(80,170,255,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(clampedLeft, area.top);
        ctx.lineTo(clampedLeft, area.bottom);
        ctx.moveTo(clampedRight, area.top);
        ctx.lineTo(clampedRight, area.bottom);
        ctx.stroke();
      });
      ctx.restore();
    }
  });
}

// 2) GAP Timeline Chart：水平條帶顯示各 gap 區段
function renderGapTimelineChart(node) {
  const container = document.getElementById('nodeGapTimelineChart');
  if (!container) return;
  if (!node || !node.total || !Array.isArray(node.total.lossGapTime) || !node.total.lossGapTime.length) {
    // Empty state
    container.getContext && container.getContext('2d');
    if (nodeGapTimelineChart) { nodeGapTimelineChart.destroy(); nodeGapTimelineChart = null; }
    // 顯示簡單訊息（保持 canvas 不被移除避免切換 tab 尺寸問題）
    const parent = container.parentElement;
    if (parent && !parent.querySelector('.gap-timeline-empty')) {
      const div = document.createElement('div');
      div.className = 'gap-timeline-empty';
      div.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#aaa;font-style:italic;';
      div.textContent = '無超出閾值的 GAP';
      parent.style.position = 'relative';
      parent.appendChild(div);
    }
    return;
  } else {
    // 移除 empty state
    const parent = container.parentElement;
    const emptyDiv = parent && parent.querySelector('.gap-timeline-empty');
    if (emptyDiv) emptyDiv.remove();
  }

  const gaps = node.total.lossGapTime.map(([s, e]) => ({ start: new Date(s).getTime(), end: new Date(e).getTime() })).filter(g => !isNaN(g.start) && !isNaN(g.end));
  if (!gaps.length) {
    if (nodeGapTimelineChart) { nodeGapTimelineChart.destroy(); nodeGapTimelineChart = null; }
    return;
  }
  // 取得使用者設定的時間範圍 (若有) 以限制 X 軸顯示範圍
  let rangeStart = null, rangeEnd = null;
  try {
    if (window.getTimeRangeFilter) {
      const tf = window.getTimeRangeFilter();
      if (tf && tf.start instanceof Date && !isNaN(tf.start.getTime())) rangeStart = tf.start.getTime();
      if (tf && tf.end instanceof Date && !isNaN(tf.end.getTime())) rangeEnd = tf.end.getTime();
    }
  } catch(e) { console.warn('[GapTimeline] getTimeRangeFilter failed', e); }
  // 若未指定則由 gaps 計算
  if (rangeStart == null) rangeStart = Math.min(...gaps.map(g => g.start));
  if (rangeEnd == null) rangeEnd = Math.max(...gaps.map(g => g.end));
  // 保護：若 start==end 則擴 1 分鐘
  if (rangeEnd - rangeStart < 60000) rangeEnd = rangeStart + 60000;
  if (nodeGapTimelineChart) nodeGapTimelineChart.destroy();
  const ctx = container.getContext('2d');
  nodeGapTimelineChart = new Chart(ctx, {
    type: 'scatter',
    data: { 
      datasets: [{ 
        label: 'GapSpan', 
        data: gaps.map((g,i) => ({ x: (g.start+g.end)/2, y: 0, _gap:g, _idx:i })), 
        pointRadius:0, 
        pointHitRadius:12, 
        pointHoverRadius:4, 
        showLine:false 
      }]
    },
    options: {
      responsive:true, 
      maintainAspectRatio:false,
      scales:{
        x:{ 
          type:'linear', 
          min: rangeStart, 
          max: rangeEnd, 
          ticks:{ 
            color:'#fff', 
            callback:(v)=> { 
              const d=new Date(v); 
              return d.toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit'}); 
            } 
          }, 
          grid:{ color:'rgba(255,255,255,0.15)'} 
        },
        y:{ display:false }
      },
      plugins:{ 
        legend:{display:false}, 
        title:{ 
          display:true, 
          text:'GAP 時間軸 (No Data Gap Timeline)', 
          color:'#fff', 
          font:{ size:14 }
        },
        tooltip:{ 
          callbacks:{ 
            title:items=> { 
              const r=items && items[0] && items[0].raw; 
              return r && r._idx!=null ? `Gap #${r._idx+1}` : 'Gap'; 
            }, 
            label:c=> { 
              const g=c.raw._gap; 
              const minutes=(g.end-g.start)/60000; 
              const dur=formatGapMinutes(minutes); 
              const human = minutes>=60 ? ` (${formatGapHuman(minutes)})` : ''; 
              return [
                `開始: ${new Date(g.start).toLocaleString()}` ,
                `結束: ${new Date(g.end).toLocaleString()}`,
                `時長: ${dur} 分${human}`
              ]; 
            } 
          } 
        } 
      }
    },
    plugins:[{
      id:'gapSpanDrawer',
      afterDatasetsDraw(chart){
        const {ctx} = chart; const xScale=chart.scales.x; if(!xScale) return; const area=chart.chartArea;
        const height = area.bottom - area.top - 12; const yTop = area.top + 6;
        chart.data.datasets[0].data.forEach(pt=>{ 
          const g=pt._gap; 
          if(!g) return; 
          const left=xScale.getPixelForValue(g.start); 
          const right=xScale.getPixelForValue(g.end); 
          if(right<area.left||left>area.right) return; 
          const L=Math.max(left,area.left); 
          const R=Math.min(right,area.right); 
          ctx.save(); 
          ctx.fillStyle='rgba(80,170,255,0.35)'; 
          ctx.strokeStyle='rgba(80,170,255,0.9)'; 
          ctx.fillRect(L,yTop,R-L,height); 
          ctx.strokeRect(L,yTop,R-L,height); 
          if(R-L>52){ 
            const minutes=(g.end-g.start)/60000; 
            const dur=formatGapMinutes(minutes)+'m'; 
            ctx.font='12px sans-serif'; 
            // 改為白色字體以提升在藍色背景上的可讀性
            ctx.fillStyle='#ffffff'; 
            const tw=ctx.measureText(dur).width; 
            if(tw < R-L-8) ctx.fillText(dur, L+(R-L-tw)/2, yTop+height/2+4);
          } 
          ctx.restore(); 
        });
      }
    }]
  });
  // 將此圖表容器高度調整為原本 (380px) 的三分之一 (~126px)
  try {
    const wrapper = container.closest('.node-chart-wrapper');
    if (wrapper) {
      const targetH = Math.max(100, Math.round(380/3));
      wrapper.style.height = targetH + 'px';
      wrapper.style.minHeight = targetH + 'px';
    }
  } catch(e) { /* ignore */ }
}

// 3) 每日最大 GAP 柱狀 (x=日期)
function renderDailyGapBarChart(node) {
  const canvas = document.getElementById('nodeDailyGapBarChart');
  if (!canvas) return;
  if (!node || !Array.isArray(node.daily) || !node.daily.length || !node.total || !node.total.gapThresholdMinutes) {
    if (nodeDailyGapBarChart) { nodeDailyGapBarChart.destroy(); nodeDailyGapBarChart = null; }
    return;
  }
  // 取得使用者設定的時間區間 (startDate/endDate) 以限制 x 軸顯示範圍
  let timeFilter = {};
  try { if (window.getTimeRangeFilter) timeFilter = window.getTimeRangeFilter() || {}; } catch(e) { /* ignore */ }
  const startMs = timeFilter.start instanceof Date && !isNaN(timeFilter.start) ? timeFilter.start.getTime() : null;
  const endMs = timeFilter.end instanceof Date && !isNaN(timeFilter.end) ? timeFilter.end.getTime() : null;

  // 收集 (日期, 值)；即使沒有 gap (maxGapMinutes 為 null/undefined/負數) 也顯示為 0
  const dayPairs = [];
  node.daily.forEach(day => {
    if (!day || !day.date || !/\d{4}-\d{2}-\d{2}/.test(day.date)) return; // 日期格式錯誤則跳過
    let dayStart = new Date(day.date + 'T00:00:00');
    let dayEnd = new Date(day.date + 'T23:59:59.999');
    if (startMs != null || endMs != null) {
      if (isNaN(dayStart)) return; // 無法解析日期
      const ds = dayStart.getTime();
      const de = isNaN(dayEnd) ? (ds + 86400000 - 1) : dayEnd.getTime();
      if (startMs != null && de < startMs) return; // 超出範圍 (在 start 之前)
      if (endMs != null && ds > endMs) return;     // 超出範圍 (在 end 之後)
    }
    const rawVal = typeof day.maxGapMinutes === 'number' && day.maxGapMinutes > 0 ? day.maxGapMinutes : 0;
    dayPairs.push({ date: day.date, value: rawVal });
  });
  // 依日期排序 (確保 x 軸順序一致)
  dayPairs.sort((a,b) => a.date.localeCompare(b.date));
  const labels = dayPairs.map(p => p.date);
  const values = dayPairs.map(p => p.value);
  if (!labels.length) { if (nodeDailyGapBarChart) { nodeDailyGapBarChart.destroy(); nodeDailyGapBarChart=null; } return; }
  if (nodeDailyGapBarChart) nodeDailyGapBarChart.destroy();
  const ctx = canvas.getContext('2d');
  nodeDailyGapBarChart = new Chart(ctx, {
    type: 'bar',
  data: { labels, datasets: [{ label: '每日最大 GAP (分鐘)', data: values, backgroundColor: 'rgba(80,170,255,0.45)', borderColor:'rgba(80,170,255,0.9)', borderWidth:1, borderRadius:4 }]},
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: c => `最大 GAP: ${formatGapMinutes(c.parsed.y)} 分` } }, title:{ display:true, text:'Daily Max No Data Gap', color:'#fff' }},
      scales:{
        x:{ ticks:{ color:'#fff' }, grid:{ color:'rgba(255,255,255,0.1)' }},
        y:{ beginAtZero:true, ticks:{ color:'#fff', callback:v=> formatGapMinutes(v) }, grid:{ color:'rgba(255,255,255,0.1)' }, title:{ display:true, text:'分鐘', color:'#fff' }}
      }
    }
  });
}

// 4) GAP Summary Badge
function renderGapSummary(node) {
  const div = document.getElementById('gapSummary');
  if (!div) return;
  if (!node || !node.total || !node.total.gapThresholdMinutes) {
    div.innerHTML = '<div class="gap-summary">未啟用 GAP 閾值或無資料</div>';
    return;
  }
  const gapCnt = Array.isArray(node.total.lossGapTime) ? node.total.lossGapTime.length : 0;
  const maxGap = typeof node.total.maxGapMinutes === 'number' ? node.total.maxGapMinutes : -1;
  const thr = node.total.gapThresholdMinutes;
  const parts = [];
  parts.push(`<div class="gap-badge">Threshold: ${thr}m</div>`);
  parts.push(`<div class="gap-badge">Gaps: ${gapCnt}</div>`);
  parts.push(`<div class="gap-badge">Max Gap: ${maxGap > -1 ? formatGapMinutes(maxGap)+'m' : '-'}</div>`);
  if (node.daily) {
    const fullDays = node.daily.filter(d => d.noData).length;
    if (fullDays) parts.push(`<div class="gap-badge" style="background:#a61e4d;">Full No-Data Days: ${fullDays}</div>`);
  }
  div.innerHTML = `<div class="gap-summary">${parts.join('')}</div>`;
}

// 5) 主函式：渲染 Gaps tab 內容
function renderNodeGapCharts(node) {
  renderGapSummary(node);
  renderGapTimelineChart(node);
  renderDailyGapBarChart(node);
}

// 6) 套用 Overlay 到既有 RSSI/SNR 圖 (table-manager.js 會已建立 nodeTimeSeriesChart)
function applyGapOverlayToTimeSeriesChart(node) {
  ensureGapOverlayPluginRegistered();
  if (!window.nodeTimeSeriesChart && window.getNodeTimeSeriesChart) {
    // 提供取 chart 的方法（未實作則略過）
    try { window.nodeTimeSeriesChart = window.getNodeTimeSeriesChart(); } catch(e) {}
  }
  const chart = window.nodeTimeSeriesChart;
  if (!chart) return;
  let segments = [];
  if (node && node.total && Array.isArray(node.total.lossGapTime)) {
    segments = node.total.lossGapTime.map(([s,e]) => [new Date(s).getTime(), new Date(e).getTime()])
      .filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  }
  chart.$gapSegments = segments;
  gapOverlayMeta.segments = segments;
  chart.update();
}

// 7) 提供外部開關功能
function setGapOverlayEnabled(flag) {
  gapOverlayEnabled = !!flag;
  const chart = window.nodeTimeSeriesChart;
  if (chart) chart.update();
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
function createNodeGwBarChart(devname, devaddr) {
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
        // 從 analytics 數據中獲取 gateway 統計
        const gatewayCounts = nodeStats.total.gatewayCounts;
        const gatewayCount = new Map();
        
        // 轉換 gatewayCounts 對象為 Map
        for (const [gateway, count] of Object.entries(gatewayCounts)) {
          if (count > 0) {
            gatewayCount.set(gateway, count);
          }
        }
        
        if (gatewayCount.size === 0) {
          showGwBarChartEmptyState();
          return;
        }
        
        // 使用 analytics 數據創建圖表
  createGatewayBarChartFromData(devname, devaddr, gatewayCount, nodeStats.total.totalWithDuplicates);
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
  showGwBarChartEmptyState();
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
  
  if (gatewayCount.size === 0) {
  showGwBarChartEmptyState();
    return;
  }
  
  // 使用原始數據創建圖表（計算總數）
  const totalWithDuplicates = filteredRecords.length;
  createGatewayBarChartFromData(devname, devaddr, gatewayCount, totalWithDuplicates);
}

/**
 * Create polar chart from gateway data (共用邏輯)
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address  
 * @param {Map} gatewayCount - Map<gateway, count>
 * @param {number} totalWithDuplicates - Total packet count for percentage calculation
 */
function createGatewayBarChartFromData(devname, devaddr, gatewayCount, totalWithDuplicates) {
  ensureExpectedLinePluginRegistered();
  // 轉為陣列並排序（由大到小）
  const gatewayEntries = Array.from(gatewayCount.entries()).sort((a, b) => b[1] - a[1]);
  const labels = gatewayEntries.map(([gateway]) => {
    if (gateway.length <= 24) return gateway; // 直接顯示
    return gateway.slice(0, 12) + '...' + gateway.slice(-8); // 縮短
  });
  const data = gatewayEntries.map(e => e[1]);
  const maxVal = data.length ? Math.max(...data) : 1;
  const expectedTotal = totalWithDuplicates; // 應接收封包總數（理論上每個 gateway 可能接收到的上行數）
  const backgroundColors = gatewayEntries.map(([, count], index) => {
    const hue = (index * 137.5) % 360; // 黃金角度分佈顏色
    const saturation = Math.min(85, 50 + (count / maxVal) * 35);
    const lightness = Math.min(70, 45 + (count / maxVal) * 25);
    return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`;
  });

  // 銷毀現有圖表
  if (nodeGwBarChart) {
    nodeGwBarChart.destroy();
    nodeGwBarChart = null;
  }

  const ctx = document.getElementById('nodeGwBarChart');
  if (!ctx) {
    console.error('[Chart] Gateway bar chart canvas not found');
    return;
  }

  nodeGwBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '接收次數',
          data,
          backgroundColor: backgroundColors,
          borderColor: 'rgba(255,255,255,0.8)',
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false
        },
        // 虛線：應接收封包總數（若 totalWithDuplicates > 0 才顯示）
        ...(expectedTotal > 0 ? [{
          // 隱藏的承載 dataset：不顯示實際折線，僅用於 tooltip 與 plugin 觸發
          type: 'line',
          label: `應接收總數 (${expectedTotal})`,
          data: labels.map(() => expectedTotal),
          borderColor: 'rgba(0,0,0,0)', // 隱藏
          pointRadius: 0,
          hitRadius: 0,
          hoverRadius: 0,
          tension: 0,
          isExpectedLine: true
        }] : [])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${devname} - Gateway 接收分布 (Bar)`,
          font: { size: 16 },
          color: '#fff'
        },
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.85)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255,255,255,0.4)',
            borderWidth: 1,
          callbacks: {
            title: ctx => {
              if (!ctx.length) return '';
              const fullName = gatewayEntries[ctx[0].dataIndex][0];
              return `Gateway: ${fullName}`;
            },
            label: ctx => {
              // 若為虛線 dataset 則以不同格式顯示
              if (ctx.dataset && ctx.dataset.isExpectedLine) {
                return [`應接收總數: ${expectedTotal}`];
              }
              const value = ctx.parsed.y;
              const pct = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
              return [`接收次數: ${value}`, `接收率: ${pct}%`, `排名: #${ctx.dataIndex + 1}`];
            },
            footer: ctx => ctx.length ? `(應接收次數: ${totalWithDuplicates})` : ''
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Gateway', color: '#fff' },
          ticks: { color: '#fff', autoSkip: false, maxRotation: 45, minRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: '接收次數', color: '#fff' },
          ticks: {
            color: '#fff',
            precision: 0,
            callback: v => Number.isInteger(v) ? v : ''
          },
          grid: { color: 'rgba(255,255,255,0.15)' }
        }
      },
      onClick: (evt, elements) => {
        if (elements.length) {
          const el = elements[0];
          const gatewayName = gatewayEntries[el.index][0];
          const count = gatewayEntries[el.index][1];
          console.log(`[Chart] Clicked gateway: ${gatewayName}, count: ${count}`);
        }
      }
    }
  });

  // 儲存期望值供 plugin 取用
  nodeGwBarChart.$expectedTotal = expectedTotal;
}

/**
 * Show empty state for gateway polar chart
 */
function showGwBarChartEmptyState() {
  const chartContainer = document.getElementById('nodeGwBarChart');
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
function updateNodeGwBarChart(devname, devaddr) {
  // 如果圖表不存在，則創建新的
  if (!nodeGwBarChart) {
    createNodeGwBarChart(devname, devaddr);
    return;
  }
  
  console.log('[Chart] Updating gateway bar chart for', devname, devaddr);
  
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
        // 從 analytics 數據中獲取 gateway 統計
        const gatewayCounts = nodeStats.total.gatewayCounts;
        const gatewayCount = new Map();
        
        // 轉換 gatewayCounts 對象為 Map
        for (const [gateway, count] of Object.entries(gatewayCounts)) {
          if (count > 0) {
            gatewayCount.set(gateway, count);
          }
        }
        
        if (gatewayCount.size === 0) {
          // 如果沒有接收器資料，清空圖表
          nodeGwBarChart.data.labels = [];
          nodeGwBarChart.data.datasets[0].data = [];
          nodeGwBarChart.data.datasets[0].backgroundColor = [];
          nodeGwBarChart.update();
          return;
        }
        
        // 使用 analytics 數據更新圖表
  updateGatewayBarChartData(devname, devaddr, gatewayCount, nodeStats.total.totalWithDuplicates);
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
  nodeGwBarChart.data.labels = [];
  nodeGwBarChart.data.datasets[0].data = [];
  nodeGwBarChart.data.datasets[0].backgroundColor = [];
  nodeGwBarChart.update();
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
  
  if (gatewayCount.size === 0) {
    // 如果沒有接收器資料，清空圖表
  nodeGwBarChart.data.labels = [];
  nodeGwBarChart.data.datasets[0].data = [];
  nodeGwBarChart.data.datasets[0].backgroundColor = [];
  nodeGwBarChart.update();
    return;
  }
  
  // 使用原始數據更新圖表（計算總數）
  const totalWithDuplicates = filteredRecords.length;
  updateGatewayBarChartData(devname, devaddr, gatewayCount, totalWithDuplicates);
}

/**
 * Update polar chart with gateway data (共用邏輯)
 * @param {string} devname - Device name
 * @param {string} devaddr - Device address  
 * @param {Map} gatewayCount - Map<gateway, count>
 * @param {number} totalWithDuplicates - Total packet count for percentage calculation
 */
function updateGatewayBarChartData(devname, devaddr, gatewayCount, totalWithDuplicates) {
  ensureExpectedLinePluginRegistered();
  const gatewayEntries = Array.from(gatewayCount.entries()).sort((a, b) => b[1] - a[1]);
  const labels = gatewayEntries.map(([gateway]) => gateway.length <= 24 ? gateway : gateway.slice(0,12)+'...'+gateway.slice(-8));
  const data = gatewayEntries.map(e => e[1]);
  const maxVal = data.length ? Math.max(...data) : 1;
  const expectedTotal = totalWithDuplicates; // 應接收封包總數
  const backgroundColors = gatewayEntries.map(([, count], index) => {
    const hue = (index * 137.5) % 360;
    const saturation = Math.min(85, 50 + (count / maxVal) * 35);
    const lightness = Math.min(70, 45 + (count / maxVal) * 25);
    return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.85)`;
  });

  nodeGwBarChart.data.labels = labels;
  nodeGwBarChart.data.datasets[0].data = data;
  nodeGwBarChart.data.datasets[0].backgroundColor = backgroundColors;
  nodeGwBarChart.options.plugins.title.text = `${devname} - Gateway 接收分布 (Bar)`;

  // 找出或建立虛線 dataset
  let expectedDsIndex = nodeGwBarChart.data.datasets.findIndex(ds => ds.isExpectedLine);
  if (expectedTotal > 0) {
    const lineData = labels.map(() => expectedTotal);
    if (expectedDsIndex === -1) {
      nodeGwBarChart.data.datasets.push({
        type: 'line',
        label: `應接收總數 (${expectedTotal})`,
        data: lineData,
        borderColor: 'rgba(0,0,0,0)',
        pointRadius: 0,
        hitRadius: 0,
        hoverRadius: 0,
        tension: 0,
        isExpectedLine: true
      });
    } else {
      const ds = nodeGwBarChart.data.datasets[expectedDsIndex];
      ds.data = lineData;
      ds.label = `應接收總數 (${expectedTotal})`;
      ds.borderColor = 'rgba(0,0,0,0)';
    }
  } else if (expectedDsIndex !== -1) {
    // 沒有 total 值則移除虛線
    nodeGwBarChart.data.datasets.splice(expectedDsIndex, 1);
  }

  // 更新 chart instance 的期望值供 plugin 使用
  nodeGwBarChart.$expectedTotal = expectedTotal;

  // 更新刻度 step
  const step = Math.max(1, Math.ceil(maxVal / 5));
  if (nodeGwBarChart.options.scales && nodeGwBarChart.options.scales.y && nodeGwBarChart.options.scales.y.ticks) {
    nodeGwBarChart.options.scales.y.ticks.stepSize = step;
  }

  // Tooltip callbacks 重新綁定（使用新的 gatewayEntries 閉包）
  nodeGwBarChart.options.plugins.tooltip.callbacks.title = ctx => ctx.length ? `Gateway: ${gatewayEntries[ctx[0].dataIndex][0]}` : '';
  nodeGwBarChart.options.plugins.tooltip.callbacks.label = ctx => {
    if (ctx.dataset && ctx.dataset.isExpectedLine) {
      return [`應接收總數: ${expectedTotal}`];
    }
    const value = ctx.parsed.y;
    const pct = totalWithDuplicates > 0 ? ((value / totalWithDuplicates) * 100).toFixed(1) : '0.0';
    return [`接收次數: ${value}`, `接收率: ${pct}%`, `排名: #${ctx.dataIndex + 1}`];
  };
  nodeGwBarChart.options.plugins.tooltip.callbacks.footer = ctx => ctx.length ? `(應接收次數: ${totalWithDuplicates})` : '';

  nodeGwBarChart.update();
  console.log(`[Chart] Updated gateway bar chart with ${gatewayCount.size} gateways`);
}

/**
 * Destroy node gateway polar chart
 */
function destroyNodeGwBarChart() {
  if (nodeGwBarChart) {
    nodeGwBarChart.destroy();
    nodeGwBarChart = null;
  }
}

/**
 * Resize node gateway polar chart
 */
function resizeNodeGwBarChart() {
  if (nodeGwBarChart) {
    nodeGwBarChart.resize();
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
  if (nodeGwBarChart) {
    setTimeout(resizeNodeGwBarChart, 100);
  }
  if (typeof window.resizeNodeParsedChart === 'function') {
    setTimeout(window.resizeNodeParsedChart, 100);
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
  // New bar chart names
  window.createNodeGwBarChart = createNodeGwBarChart;
  window.updateNodeGwBarChart = updateNodeGwBarChart;
  window.destroyNodeGwBarChart = destroyNodeGwBarChart;
  window.resizeNodeGwBarChart = resizeNodeGwBarChart;
  // Backward compatibility aliases
  window.createNodeGwPolarChart = createNodeGwBarChart;
  window.updateNodeGwPolarChart = updateNodeGwBarChart;
  window.destroyNodeGwPolarChart = destroyNodeGwBarChart;
  window.resizeNodeGwPolarChart = resizeNodeGwBarChart;
  // GAP exports
  window.renderNodeGapCharts = renderNodeGapCharts;
  window.applyGapOverlayToTimeSeriesChart = applyGapOverlayToTimeSeriesChart;
  window.setGapOverlayEnabled = setGapOverlayEnabled;
}

// ============================
// Payload Parser 時序圖 (x: 時間, y: 解析值)
// ============================

/**
 * 解析某節點的 RawRecords，使用 LoRaDataParser 與 JSON 路徑取值，並建立折線圖
 * @param {string} devname
 * @param {string} devaddr
 */
function createNodeParsedChart(devname, devaddr) {
  const container = document.getElementById('nodeParsedChart');
  const canvas = document.getElementById('nodeParsedDataChart');
  const statusEl = document.getElementById('payloadParserStatus');
  const errEl = document.getElementById('payloadParserError');
  if (!container) return;
  // 若畫布被替換為空態，復原
  if (!canvas) {
    const wrapper = container.querySelector('.node-chart-wrapper');
    if (wrapper) wrapper.innerHTML = '<canvas id="nodeParsedDataChart"></canvas>';
  }
  const canvasEl = document.getElementById('nodeParsedDataChart');
  if (!canvasEl) return;

  // 銷毀舊圖
  if (nodeParsedDataChart) { nodeParsedDataChart.destroy(); nodeParsedDataChart = null; }

  // 取得與 RSSI/SNR 相同邏輯的時間範圍，做為 x 軸 min/max
  const timeFilter = (typeof window.getTimeRangeFilter === 'function') ? (window.getTimeRangeFilter() || {}) : {};

  const typeSel = document.getElementById('payloadParserType');
  const pathInput = document.getElementById('payloadParserJsonPath');
  const pathInput2 = document.getElementById('payloadParserJsonPath2');
  const pathInput3 = document.getElementById('payloadParserJsonPath3');
  const parserType = (typeSel?.value || '').trim().toLowerCase();
  const jsonPaths = [pathInput, pathInput2, pathInput3]
    .map(el => (el && el.value ? el.value.trim() : ''))
    .filter(p => p);
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  // 未選擇 parser 類型時顯示提示
  if (!parserType) {
    const wrapper = canvasEl.parentElement;
    if (wrapper) wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:360px;color:#aaa;font-style:italic;">請選擇 Parser 類型並輸入 JSON 路徑</div>';
    return;
  }

  // 確保是 canvas 狀態
  if (!canvasEl.parentElement.querySelector('canvas')) {
    canvasEl.parentElement.innerHTML = '<canvas id="nodeParsedDataChart"></canvas>';
  }
  const ctx = document.getElementById('nodeParsedDataChart').getContext('2d');

  try {
    // 至少需要一條路徑
    if (!jsonPaths.length) {
      const wrapper = ctx.canvas.parentElement;
      if (wrapper) wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:360px;color:#aaa;font-style:italic;">請至少輸入 1 條 JSON 路徑</div>';
      return;
    }

    const seriesList = jsonPaths.map(p => ({ path: p, points: collectParsedSeriesForNode(devname, devaddr, parserType, p) }));
    if (statusEl) statusEl.textContent = `系列: ${seriesList.length}，點數: ${seriesList.map(s=>s.points.length).join(' / ')}`;
    const anyPoints = seriesList.some(s => s.points.length);
    if (!anyPoints) {
      const wrapper = ctx.canvas.parentElement;
      if (wrapper) wrapper.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:360px;color:#aaa;font-style:italic;">沒有符合條件的解析數據</div>';
      return;
    }
    // 調色盤（可擴充）
    const colors = [
      { b: 'rgba(255,206,86,1)', f: 'rgba(255,206,86,0.2)' }, // 黃
      { b: 'rgba(54,162,235,1)', f: 'rgba(54,162,235,0.2)' }, // 藍
      { b: 'rgba(255,99,132,1)', f: 'rgba(255,99,132,0.2)' }, // 紅
      { b: 'rgba(75,192,192,1)', f: 'rgba(75,192,192,0.2)' }, // 綠
      { b: 'rgba(153,102,255,1)', f: 'rgba(153,102,255,0.2)' }, // 紫
    ];

    nodeParsedDataChart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: seriesList.map((s, idx) => ({
          label: s.path,
          data: s.points.map(p => ({ x: p.ts, y: p.value, _p: p })),
          borderColor: colors[idx % colors.length].b,
          backgroundColor: colors[idx % colors.length].f,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.1
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { labels: { color: '#fff' } },
          title: { display: true, text: `${devname} - Parsed Payload`, color: '#fff', font: { size: 16 } },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            titleColor: '#fff', bodyColor: '#fff', borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1,
            callbacks: {
              title: (items) => items?.[0] ? new Date(items[0].parsed.x).toLocaleString('zh-TW') : '',
              label: (ctx) => {
                const p = ctx.raw?._p || {};
                const lines = [];
                lines.push(`${ctx.dataset.label} = ${ctx.parsed.y}`);
                if (p.fcnt != null) lines.push(`FCNT: ${p.fcnt}`);
                if (p.timeStr) lines.push(`時間: ${p.timeStr}`);
                if (p.port != null) lines.push(`Port: ${p.port}`);
                return lines;
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
            title: { display: true, text: '時間', color: '#fff' },
            ticks: {
              color: '#fff',
              maxTicksLimit: 8,
              callback: function(value) {
                const d = new Date(value);
                if (isNaN(d.getTime())) return '';
                return d.toLocaleString('zh-TW', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
              }
            },
            grid: { color: 'rgba(255,255,255,0.1)' }
          },
          y: {
            type: 'linear',
            ticks: { color: '#fff' },
            grid: { color: 'rgba(255,255,255,0.1)' }
          }
        }
      }
    });
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || String(e); errEl.style.display = 'block'; }
    console.error('[ParsedChart] create failed', e);
  }
}

/** 更新解析圖 (重新取得 UI 條件) */
function updateNodeParsedChart(devname, devaddr) {
  createNodeParsedChart(devname, devaddr);
}

/** 銷毀解析圖 */
function destroyNodeParsedChart() {
  if (nodeParsedDataChart) { nodeParsedDataChart.destroy(); nodeParsedDataChart = null; }
}

/** 調整解析圖大小 */
function resizeNodeParsedChart() {
  if (nodeParsedDataChart) nodeParsedDataChart.resize();
}

// 內部：收集某節點的解析序列
function collectParsedSeriesForNode(devname, devaddr, parserType, jsonPath) {
  console.log('[ParsedChart] Collecting parsed series for', devname, devaddr, parserType, jsonPath);
  const recs = (typeof window.getRawRecords === 'function') ? window.getRawRecords() : [];
  if (!Array.isArray(recs) || !recs.length) return [];
  // 時間篩選
  const timeFilter = (typeof window.getTimeRangeFilter === 'function') ? window.getTimeRangeFilter() : {};
  // 快速多鍵存取
  const getField = (obj, ...keys) => {
    if (!obj) return undefined;
    for (const k of keys) if (k in obj && obj[k] != null) return obj[k];
    const lower = Object.keys(obj).reduce((m, k) => (m[k.toLowerCase()] = obj[k], m), {});
    for (const k of keys) { const v = lower[k.toLowerCase()]; if (v != null) return v; }
    return undefined;
  };
  const devnameKey = (devname||'').trim().toLowerCase();
  const devaddrKey = (devaddr||'').trim().toLowerCase();
  let filtered = recs.filter(r => {
    const rn = (getField(r,'Devname','DevName','Device Name')||'').toString().trim().toLowerCase();
    const ra = (getField(r,'Devaddr','DevAddr')||'').toString().trim().toLowerCase();
    return rn === devnameKey || ra === devaddrKey || rn === devaddrKey || ra === devnameKey;
  });
  // 時間過濾
  if (timeFilter && (timeFilter.start || timeFilter.end)) {
    filtered = filtered.filter(r => {
      const t = getField(r,'Time','Received');
      const d = (t instanceof Date) ? t : new Date(t);
      if (isNaN(d)) return false;
      if (timeFilter.start && d < timeFilter.start) return false;
      if (timeFilter.end && d > timeFilter.end) return false;
      return true;
    });
  }
  // 僅上行
  filtered = filtered.filter(r => {
    const type = getField(r,'Type','FrameType','Frame Type');
    return type && (type.toString().toLowerCase().includes('up') || (typeof type === 'object' && type.isUp));
  });

  // 解析器
  let ParserCtor = null;
  if (typeof window !== 'undefined' && window.LoRaDataParser) {
    ParserCtor = window.LoRaDataParser;
  } else if (typeof require !== 'undefined') {
    try { ParserCtor = require('./lora-data-parser.js'); } catch (e) { /* ignore */ }
  }
  if (!ParserCtor) throw new Error('LoRaDataParser 未載入');
  const parser = new ParserCtor();
  const fportGetter = r => getField(r,'Port');

  // 路徑取值工具（支援 dot 路徑）
  const pickByPath = (obj, path) => {
    if (!path) return undefined;
    const segs = path.split('.').map(s=>s.trim()).filter(Boolean);
    let cur = obj;
    for (let seg of segs) {
      // 支援像 'data[*]' 的片段：先取 'data' 屬性，再取第一個元素
      let needsWildcard = false;
      if (seg.endsWith('[*]')) {
        needsWildcard = true;
        seg = seg.slice(0, -3); // 去掉 [*]
      }
      if (seg) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, seg)) cur = cur[seg];
        else if (cur && typeof cur === 'object' && seg in cur) cur = cur[seg];
        else return undefined;
      }
      if (needsWildcard) {
        if (Array.isArray(cur) && cur.length > 0) {
          cur = cur[0];
        } else {
          return undefined;
        }
      }
    }
    return cur;
  };

  const points = [];
  // 逐筆解析
  for (const r of filtered) {
    const hex = getField(r,'Data','Payload','Hex');
    if (!hex || typeof hex !== 'string') continue;
    let parsed = null;
    try {
      if (parserType === 'wise') {
        parsed = parser.parseWise(hex, { macAddress: getField(r,'DevEUI','Mac','MAC'), enableStorage:false });
      } else if (parserType === 'eva') {
        const fp = fportGetter(r);
        if (fp == null || fp === '') continue; // EVA 需要 fport
        parsed = parser.parseEva(hex, Number(fp));
      } else {
        // 取消自動解析：未指定 parserType 時不解析
        parsed = null;
      }
    } catch(e) {
      // 單筆解析失敗忽略
      continue;
    }
    if (!parsed || !parsed.success) continue;
    const source = parsed.data || parsed.message || {};
    const value = jsonPath ? pickByPath(source, jsonPath) : undefined;
    const num = Number(value);
    if (value === undefined || !isFinite(num)) continue; // 僅繪出可數值化的值
    const rawTime = getField(r,'Time','Received');
    const d = (rawTime instanceof Date)? rawTime : new Date(rawTime);
    if (isNaN(d)) continue;
    points.push({ ts: d.getTime(), value: num, fcnt: getField(r,'Fcnt','FCnt'), timeStr: d.toLocaleString('zh-TW'), port: getField(r,'Port') });
  }
  // 依時間排序
  points.sort((a,b)=>a.ts-b.ts);
  return points;
}

// 對外暴露
if (typeof window !== 'undefined') {
  window.createNodeParsedChart = createNodeParsedChart;
  window.updateNodeParsedChart = updateNodeParsedChart;
  window.destroyNodeParsedChart = destroyNodeParsedChart;
  window.resizeNodeParsedChart = resizeNodeParsedChart;
}
