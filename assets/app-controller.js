// Main Controller (v2) 使用新版 parseCSVRaw + buildAnalytics

// 全域暫存：原始紀錄與分析結果
let rawRecords = []; 
let currentAnalytics = null; // {perNode, global, threshold, meta}
let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // 使用者目前選擇（預設瀏覽器）
let originalCsvText = null; // 保存原始 CSV 文字供時區切換重解析

// 固定的 UTC 偏移 + 顯示名稱列表（需求指定）
// label: 顯示, tz: IANA 時區
const FIXED_TIMEZONES = [
  { label: '(UTC−12:00) Baker Island', tz: 'Etc/GMT+12' },
  { label: '(UTC−11:00) Pago Pago', tz: 'Pacific/Pago_Pago' },
  { label: '(UTC−10:00) Honolulu', tz: 'Pacific/Honolulu' },
  { label: '(UTC−09:00) Anchorage', tz: 'America/Anchorage' },
  { label: '(UTC−08:00) Los Angeles', tz: 'America/Los_Angeles' },
  { label: '(UTC−07:00) Denver', tz: 'America/Denver' },
  { label: '(UTC−06:00) Mexico City', tz: 'America/Mexico_City' },
  { label: '(UTC−05:00) New York', tz: 'America/New_York' },
  { label: '(UTC−04:00) Santiago', tz: 'America/Santiago' },
  { label: '(UTC−03:30) St. John’s', tz: 'America/St_Johns' },
  { label: '(UTC−03:00) Buenos Aires', tz: 'America/Argentina/Buenos_Aires' },
  { label: '(UTC−02:00) South Georgia', tz: 'Atlantic/South_Georgia' },
  { label: '(UTC−01:00) Azores', tz: 'Atlantic/Azores' },
  { label: '(UTC±00:00) London', tz: 'Europe/London' },
  { label: '(UTC+01:00) Berlin', tz: 'Europe/Berlin' },
  { label: '(UTC+02:00) Athens', tz: 'Europe/Athens' },
  { label: '(UTC+03:00) Moscow', tz: 'Europe/Moscow' },
  { label: '(UTC+03:30) Tehran', tz: 'Asia/Tehran' },
  { label: '(UTC+04:00) Dubai', tz: 'Asia/Dubai' },
  { label: '(UTC+04:30) Kabul', tz: 'Asia/Kabul' },
  { label: '(UTC+05:00) Karachi', tz: 'Asia/Karachi' },
  { label: '(UTC+05:30) New Delhi', tz: 'Asia/Kolkata' },
  { label: '(UTC+05:45) Kathmandu', tz: 'Asia/Kathmandu' },
  { label: '(UTC+06:00) Dhaka', tz: 'Asia/Dhaka' },
  { label: '(UTC+06:30) Yangon', tz: 'Asia/Yangon' },
  { label: '(UTC+07:00) Bangkok', tz: 'Asia/Bangkok' },
  { label: '(UTC+08:00) Taipei', tz: 'Asia/Taipei' },
  { label: '(UTC+08:00) Singapore', tz: 'Asia/Singapore' },
  { label: '(UTC+09:00) Tokyo', tz: 'Asia/Tokyo' },
  { label: '(UTC+09:30) Adelaide', tz: 'Australia/Adelaide' },
  { label: '(UTC+10:00) Sydney', tz: 'Australia/Sydney' },
  { label: '(UTC+11:00) Honiara', tz: 'Pacific/Honiara' },
  { label: '(UTC+12:00) Auckland', tz: 'Pacific/Auckland' },
  { label: '(UTC+12:45) Chatham Islands', tz: 'Pacific/Chatham' },
  { label: '(UTC+13:00) Apia', tz: 'Pacific/Apia' },
  { label: '(UTC+14:00) Kiritimati', tz: 'Pacific/Kiritimati' },
];

function populateTimezoneDropdown() {
  const sel = document.getElementById('timezoneSelect');
  const wrapper = document.getElementById('timezoneCustomWrapper');
  const btn = document.getElementById('timezoneSelectButton');
  const optBox = document.getElementById('timezoneOptions');
  if (!sel) return;
  sel.innerHTML = '';
  if (optBox) optBox.innerHTML = '';
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let matched = false;
  FIXED_TIMEZONES.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.tz;
    opt.textContent = item.label + (item.tz === browserTz ? ' (Browser)' : '');
    if (!matched && item.tz === browserTz) {
      opt.selected = true;
      currentTimezone = item.tz;
      matched = true;
    }
    sel.appendChild(opt);
    if (optBox) {
      const div = document.createElement('div');
      div.className = 'tz-option';
      div.setAttribute('role','option');
      div.dataset.value = item.tz;
      div.textContent = opt.textContent;
      if (item.tz === currentTimezone) {
        div.classList.add('active');
        div.setAttribute('aria-selected','true');
      }
      div.addEventListener('click', () => { selectTimezoneValue(item.tz); closeTzMenu(); });
      optBox.appendChild(div);
    }
  });
  if (!matched) {
    const london = FIXED_TIMEZONES.find(z => z.tz === 'Europe/London');
    if (london) { currentTimezone = london.tz; sel.value = london.tz; }
  }
  if (btn) {
    const selectedOpt = sel.options[sel.selectedIndex];
    btn.textContent = selectedOpt ? selectedOpt.textContent : 'Select Timezone';
  }
  function openTzMenu() {
    if (!optBox || !btn) return;
    optBox.classList.add('open');
    btn.setAttribute('aria-expanded','true');
    const active = optBox.querySelector('.tz-option.active');
    if (active) active.scrollIntoView({block:'nearest'});
  }
  function closeTzMenu() {
    if (!optBox || !btn) return;
    optBox.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
  }
  function toggleTzMenu() { if (optBox && optBox.classList.contains('open')) closeTzMenu(); else openTzMenu(); }
  function selectTimezoneValue(val) {
    currentTimezone = val;
    sel.value = val;
    if (optBox) {
      optBox.querySelectorAll('.tz-option').forEach(el => {
        const active = el.dataset.value === val;
        el.classList.toggle('active', active);
        if (active) el.setAttribute('aria-selected','true'); else el.removeAttribute('aria-selected');
      });
    }
    const selectedOpt = sel.options[sel.selectedIndex];
    if (btn) btn.textContent = selectedOpt ? selectedOpt.textContent : val;
    if (originalCsvText) {
      try {
        rawRecords = parseCSVRaw(originalCsvText, { timezone: currentTimezone });
        console.log('[App][Timezone] Re-parsed raw under new timezone:', currentTimezone, rawRecords.length);
      } catch(e) { console.warn('[App][Timezone] Re-parse failed:', e); }
    }
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    if (startInput && startInput.value) {
      const parsed = parseDateTimeLocalWithTZ(startInput.value, currentTimezone);
      if (parsed) startInput.value = dateToDateTimeLocalWithTZ(parsed, currentTimezone);
    }
    if (endInput && endInput.value) {
      const parsed = parseDateTimeLocalWithTZ(endInput.value, currentTimezone);
      if (parsed) endInput.value = dateToDateTimeLocalWithTZ(parsed, currentTimezone);
    }
    rebuildAnalytics();
    refreshOverlayIfOpen();
  }
  window.selectTimezoneValue = selectTimezoneValue;
  function focusNext(dir) {
    if (!optBox) return;
    const items = Array.from(optBox.querySelectorAll('.tz-option'));
    let idx = items.findIndex(i=>i.classList.contains('active'));
    if (idx === -1) idx = 0;
    idx = (idx + dir + items.length) % items.length;
    const target = items[idx];
    if (target) {
      items.forEach(i=>i.classList.remove('active'));
      target.classList.add('active');
      target.scrollIntoView({block:'nearest'});
    }
  }
  if (btn) {
    btn.addEventListener('click', toggleTzMenu);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTzMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); openTzMenu(); focusNext(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); openTzMenu(); focusNext(-1); }
      else if (e.key === 'Escape') { closeTzMenu(); }
    });
  }
  document.addEventListener('click', (e) => {
    if (!wrapper) return;
    if (!wrapper.contains(e.target)) closeTzMenu();
  });
  if (optBox) {
    optBox.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); focusNext(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusNext(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); const act = optBox.querySelector('.tz-option.active'); if (act) { selectTimezoneValue(act.dataset.value); closeTzMenu(); } }
      else if (e.key === 'Escape') { closeTzMenu(); btn && btn.focus(); }
    });
  }
}

function getSelectedTimezone() {
  return currentTimezone;
}

// 將 Date 物件格式化為 datetime-local string 但以 currentTimezone 解讀（顯示仍以本地控件）
function dateToDateTimeLocalWithTZ(date, tz) {
  try {
    // 以指定時區分解
    const fmt = new Intl.DateTimeFormat('en-CA', { // en-CA 給 YYYY-MM-DD
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch(e) {
    // fallback 使用原本本地
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,'0');
    const day = String(date.getDate()).padStart(2,'0');
    const hour = String(date.getHours()).padStart(2,'0');
    const minute = String(date.getMinutes()).padStart(2,'0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
}

// 將 datetime-local 控制值依 currentTimezone 轉換成 UTC Date
function parseDateTimeLocalWithTZ(value, tz) {
  // value: YYYY-MM-DDTHH:mm
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split('-').map(n=>parseInt(n,10));
  const [hour, minute] = timePart.split(':').map(n=>parseInt(n,10));
  // 使用指定時區建立對應 UTC：透過 Date.UTC + 偏移推算
  // 簡易作法：使用該時區格式化一個暫存 Date 去反推 offset 不可靠；改用 Temporal 若可用
  if (typeof Temporal !== 'undefined' && Temporal.ZonedDateTime) {
    try {
      const zoned = new Temporal.ZonedDateTime.from({ year, month, day, hour, minute, timeZone: tz, nanosecond:0 });
      return new Date(zoned.epochMilliseconds);
    } catch(e) {
      // fallback 下方
    }
  }
  // Fallback: 假設輸入值是此時區的 wall time，先當作 UTC 建 Date，再調整成該時區 offset
  // 近似：建立一個在本地的 Date，再用該時區格式化後判斷偏移（簡化，不完全精準於 DST 切換瞬間）
  const temp = new Date(Date.UTC(year, month-1, day, hour, minute));
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
    const parts = Object.fromEntries(fmt.formatToParts(temp).map(p=>[p.type,p.value]));
    // 取得該時區此刻實際 local parts 對應的 UTC
    const tzYear = parseInt(parts.year,10);
    const tzMonth = parseInt(parts.month,10);
    const tzDay = parseInt(parts.day,10);
    const tzHour = parseInt(parts.hour,10);
    const tzMinute = parseInt(parts.minute,10);
    // 若 parts 與輸入不同，估算 offset 差
    const desired = Date.UTC(year, month-1, day, hour, minute);
    const got = Date.UTC(tzYear, tzMonth-1, tzDay, tzHour, tzMinute);
    const diffMs = desired - got; // 期望與實際，反向補
    return new Date(temp.getTime() + diffMs);
  } catch(e) {
    return temp; // 最後 fallback
  }
}

/**
 * 初始化應用
 */
function initializeApp() {
  console.log('[App] Initializing WISE6610 Data Analyzer (v2 analytics)...');
  setupEventListeners();
  console.log('[App] Ready');
}

/** 建立分類規則 (階層式分類：先檢查 exception，再分 normal/abnormal) */
function buildClassificationConfig(options = {}) {
  const {
    threshold = 0, // 預設為 0，0 也是有效的 Loss Rate 篩選條件
    fcntFilter = { enabled: false },
  gapThresholdMinutes = null,
  inactiveSinceMinutes = null
  } = options;

  const rules = [];

  // 第一層：Exception 規則（只有當篩選啟用時才加入）
  
  // FCNT reset 規則 - 只有在啟用時才檢查
  if (fcntFilter.enabled && fcntFilter.threshold > 0) {
    rules.push({
      metric: 'resetCount',
      op: '>=',
      value: fcntFilter.threshold,
      category: 'exception',
      note: `resetCount >= ${fcntFilter.threshold}`,
      priority: 1
    });
  }

  // Gap 規則 - 只有在啟用時才檢查
  if (gapThresholdMinutes && gapThresholdMinutes > 0) {
    rules.push({
      metric: 'maxGapMinutes',
      op: '>=',
      value: gapThresholdMinutes,
      category: 'exception',
      note: `No data gap >= ${gapThresholdMinutes} minutes`,
      priority: 1
    });
  }

  // Inactive Since 規則 - 只有在啟用時才檢查
  if (inactiveSinceMinutes && inactiveSinceMinutes > 0) {
    rules.push({
      metric: 'inactiveSinceMinutes',
      op: '>=',
      value: inactiveSinceMinutes,
      category: 'exception',
      note: `Inactive since >= ${inactiveSinceMinutes} minutes (node.last -> overall.last)`,
      priority: 1
    });
  }

  // 第二層：Normal vs Abnormal 規則（只對非 exception 節點適用）
  // threshold >= 0 都會建立規則，0 也是有效的篩選條件
  if (threshold >= 0) {
    rules.push({
      metric: 'lossRate',
      op: '>',
      value: threshold,
      category: 'abnormal',
      note: `lossRate > ${threshold}%`,
      priority: 2
    });
  }

  const config = {
    version: 'hierarchical-2',
    defaultCategory: 'normal',
    rules,
    filterOptions: {
      lossRateThreshold: threshold,
      fcntFilter,
  gapThresholdMinutes,
  inactiveSinceMinutes
    },
    hierarchical: true // 標記為階層式分類
  };

  console.log('[Classification] Built hierarchical classification config:', config);
  
  return config;
}

/** 根據篩選條件過濾節點 */
function applyNodeFilters(analytics, { fcntFilter, gapThresholdMinutes }) {
  if (!fcntFilter.enabled && !gapThresholdMinutes) {
    return analytics; // 沒有篩選條件，直接返回原始數據
  }

  let filteredNodes = analytics.perNode;

  // FCNT Issue 篩選：只保留有 FCNT reset/drop 問題的節點
  if (fcntFilter.enabled) {
    filteredNodes = filteredNodes.filter(node => {
      const resetCount = node.total?.resetCount || 0;
      return resetCount >= fcntFilter.threshold;
    });
    console.log(`[App] FCNT Issue filter: ${filteredNodes.length} nodes with resetCount >= ${fcntFilter.threshold}`);
  }

  // No Data Gap 篩選：只保留有長時間無數據間隔的節點
  if (gapThresholdMinutes && filteredNodes.length > 0) {
    filteredNodes = filteredNodes.filter(node => {
      // 檢查節點是否有 gap 相關數據
      if (node.total?.gapThresholdMinutes && node.total?.maxGapMinutes) {
        return node.total.maxGapMinutes >= gapThresholdMinutes;
      }
      return false; // 沒有 gap 數據的節點不符合條件
    });
    console.log(`[App] No Data Gap filter: ${filteredNodes.length} nodes with gaps >= ${gapThresholdMinutes} minutes`);
  }

  // 重新計算 threshold view 以反映篩選後的結果
  const filteredThreshold = rebuildThresholdViewForFilteredNodes(filteredNodes, analytics.meta.classification);

  // 重新計算 global 統計（基於篩選後的節點）
  const filteredGlobal = rebuildGlobalForFilteredNodes(filteredNodes);

  return {
    ...analytics,
    perNode: filteredNodes,
    threshold: filteredThreshold,
    global: filteredGlobal
  };
}

/** 自動填入時間範圍到日期欄位 */
function autoFillDateRange(records) {
  if (!records || records.length === 0) return;
  
  // 取得日期輸入元素
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  // 找出最早和最晚時間
  let earliestTime = null;
  let latestTime = null;
  
  records.forEach(record => {
    if (record.Time && record.Time instanceof Date && !isNaN(record.Time.getTime())) {
      if (!earliestTime || record.Time < earliestTime) {
        earliestTime = record.Time;
      }
      if (!latestTime || record.Time > latestTime) {
        latestTime = record.Time;
      }
    }
  });
  
  // 如果找到有效的時間範圍
  if (earliestTime && latestTime) {
    // 轉換為 datetime-local 格式 (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (date) => dateToDateTimeLocalWithTZ(date, currentTimezone);
    
    // 自動填入最早時間（如果欄位為空）
    if (startDateInput && !startDateInput.value) {
      startDateInput.value = formatDateTimeLocal(earliestTime);
      console.log('[App] Auto-filled start date:', startDateInput.value);
    }
    
    // 自動填入最晚時間（如果欄位為空）
    if (endDateInput && !endDateInput.value) {
      endDateInput.value = formatDateTimeLocal(latestTime);
      console.log('[App] Auto-filled end date:', endDateInput.value);
    }
  }
}

/** 為篩選後的節點重新計算 threshold view */
function rebuildThresholdViewForFilteredNodes(filteredNodes, classification) {
  if (!filteredNodes.length) {
    return {
      total: { normalcnt: 0, abnormalcnt: 0, exceptioncnt: 0, normal: [], abnormal: [], exception: [] },
      list: []
    };
  }

  // 使用與 buildAnalytics 相同的分類邏輯
  const dateMap = new Map();
  
  filteredNodes.forEach(node => {
    if (node.daily && node.daily.length > 0) {
      node.daily.forEach(dailyStat => {
        if (!dateMap.has(dailyStat.date)) {
          dateMap.set(dailyStat.date, {
            date: dailyStat.date,
            normal: [],
            abnormal: [],
            exception: []
          });
        }
        
        // 分類節點（使用每日統計）
        const category = classifyNodeDaily(dailyStat, classification);
        const nodeName = node.id?.devName || node.id?.devAddr || 'unknown';
        dateMap.get(dailyStat.date)[category].push(nodeName);
      });
    }
  });

  // 構建 list
  const list = Array.from(dateMap.values()).map(dayData => ({
    ...dayData,
    normalcnt: dayData.normal.length,
    abnormalcnt: dayData.abnormal.length,
    exceptioncnt: dayData.exception.length
  })).sort((a, b) => a.date.localeCompare(b.date));

  // 構建 total（使用節點總體統計）
  const totalNormal = new Set();
  const totalAbnormal = new Set();
  const totalException = new Set();

  filteredNodes.forEach(node => {
    const category = classifyNode(node, classification);
    const nodeName = node.id?.devName || node.id?.devAddr || 'unknown';
    
    if (category === 'normal') totalNormal.add(nodeName);
    else if (category === 'abnormal') totalAbnormal.add(nodeName);
    else if (category === 'exception') totalException.add(nodeName);
  });

  const total = {
    normalcnt: totalNormal.size,
    abnormalcnt: totalAbnormal.size,
    exceptioncnt: totalException.size,
    normal: Array.from(totalNormal),
    abnormal: Array.from(totalAbnormal),
    exception: Array.from(totalException)
  };

  return { total, list };
}

/** 分類單一節點（基於總體統計） */
function classifyNode(node, classification) {
  const metrics = {
    lossRate: node.total?.lossRate,
    resetCount: node.total?.resetCount,
    maxGapMinutes: node.total?.maxGapMinutes || -1, // Gap detection 結果（分鐘）
    avgRSSI: node.total?.avgRSSI,
    avgSNR: node.total?.avgSNR
  };
  return classifyByRules(metrics, classification);
}

/** 分類節點（基於每日統計） */
function classifyNodeDaily(dailyStat, classification) {
  const metrics = {
    lossRate: dailyStat.lossRate,
    resetCount: dailyStat.resetCount,
    avgRSSI: dailyStat.avgRSSI,
    avgSNR: dailyStat.avgSNR,
    // 每日統計沒有 gap 資訊，使用 -1 表示不適用
    maxGapMinutes: -1
  };
  return classifyByRules(metrics, classification);
}

/** 根據規則分類 (階層式：先檢查 exception，再分 normal/abnormal) */
function classifyByRules(metrics, classification) {
  const rules = classification.rules || [];
  
  // 如果是階層式分類
  if (classification.hierarchical) {
    // 第一層：檢查 exception 規則（priority = 1）
    const exceptionRules = rules.filter(rule => rule.priority === 1);
    for (const rule of exceptionRules) {
      const value = metrics[rule.metric];
      
      // 跳過無效值
      if (value === undefined || value === null || Number.isNaN(value)) {
        continue;
      }
      
      // 對於 maxGapMinutes，-1 表示沒有 gap 數據或不適用
      if (rule.metric === 'maxGapMinutes' && value === -1) {
        continue;
      }
      
      if (applyRule(value, rule)) {
        console.log(`[Classification] Node classified as 'exception' due to ${rule.metric}: ${value} ${rule.op} ${rule.value}`);
        return 'exception';
      }
    }
    
    // 第二層：如果不是 exception，檢查 normal/abnormal 規則（priority = 2）
    const normalAbnormalRules = rules.filter(rule => rule.priority === 2);
    for (const rule of normalAbnormalRules) {
      const value = metrics[rule.metric];
      
      // 跳過無效值
      if (value === undefined || value === null || Number.isNaN(value)) {
        continue;
      }
      
      if (applyRule(value, rule)) {
        console.log(`[Classification] Node classified as '${rule.category}' due to ${rule.metric}: ${value} ${rule.op} ${rule.value}`);
        return rule.category;
      }
    }
    
    // 如果沒有符合任何規則，返回預設類別
    console.log(`[Classification] Node classified as 'normal' (default)`);
    return classification.defaultCategory || 'normal';
  }
  
  // 傳統的非階層式分類（向後相容）
  for (const rule of rules) {
    const value = metrics[rule.metric];
    
    // 跳過無效值
    if (value === undefined || value === null || Number.isNaN(value)) {
      continue;
    }
    
    // 對於 maxGapMinutes，-1 表示沒有 gap 數據或不適用
    if (rule.metric === 'maxGapMinutes' && value === -1) {
      continue;
    }
    
    if (applyRule(value, rule)) {
      console.log(`[Classification] Node classified as '${rule.category}' due to ${rule.metric}: ${value} ${rule.op} ${rule.value}`);
      return rule.category;
    }
  }
  
  return classification.defaultCategory || 'normal';
}

/** 應用單一規則 */
function applyRule(value, rule) {
  const { op, value: ruleValue } = rule;
  
  switch (op) {
    case '>=': return value >= ruleValue;
    case '>': return value > ruleValue;
    case '<=': return value <= ruleValue;
    case '<': return value < ruleValue;
    case '==': return value == ruleValue;
    case '!=': return value != ruleValue;
    default: return false;
  }
}

/** 為篩選後的節點重新計算 global 統計 */
function rebuildGlobalForFilteredNodes(filteredNodes) {
  if (!filteredNodes.length) {
    return {
      total: {
        nodes: 0,
        uniquePackets: 0,
        totalWithDuplicates: 0,
        expected: 0,
        lost: 0,
        lossRate: -1,
        avgRSSI: null,
        avgSNR: null,
        firstTime: null,
        lastTime: null,
        fcntSpan: -1,
        resetCount: 0,
        duplicatePackets: 0,
        dataRatesUsed: []
      },
      daily: []
    };
  }

  // 聚合所有篩選後節點的統計
  let totalUniquePackets = 0;
  let totalWithDuplicates = 0;
  let totalExpected = 0;
  let totalLost = 0;
  let totalResetCount = 0;
  let totalDuplicatePackets = 0;
  
  let rssiSum = 0, rssiCount = 0;
  let snrSum = 0, snrCount = 0;
  let allDataRates = new Set();
  
  let earliestTime = null;
  let latestTime = null;
  let minFcnt = null, maxFcnt = null;

  filteredNodes.forEach(node => {
    totalUniquePackets += node.total?.uniquePackets || 0;
    totalWithDuplicates += node.total?.totalWithDuplicates || 0;
    totalExpected += node.total?.expected || 0;
    totalLost += node.total?.lost || 0;
    totalResetCount += node.total?.resetCount || 0;
    totalDuplicatePackets += node.total?.duplicatePackets || 0;

    // Quality metrics
    if (node.total?.avgRSSI !== null && node.total?.avgRSSI !== undefined) {
      rssiSum += node.total.avgRSSI * (node.total?.totalWithDuplicates || 0);
      rssiCount += node.total?.totalWithDuplicates || 0;
    }
    if (node.total?.avgSNR !== null && node.total?.avgSNR !== undefined) {
      snrSum += node.total.avgSNR * (node.total?.totalWithDuplicates || 0);
      snrCount += node.total?.totalWithDuplicates || 0;
    }

    // Data rates
    if (node.total?.dataRatesUsed) {
      node.total.dataRatesUsed.forEach(rate => allDataRates.add(rate));
    }

    // Time range
    if (node.timeline?.firstTime) {
      const firstTime = new Date(node.timeline.firstTime);
      if (!earliestTime || firstTime < earliestTime) {
        earliestTime = firstTime;
      }
    }
    if (node.timeline?.lastTime) {
      const lastTime = new Date(node.timeline.lastTime);
      if (!latestTime || lastTime > latestTime) {
        latestTime = lastTime;
      }
    }
  });

  const avgRSSI = rssiCount > 0 ? rssiSum / rssiCount : null;
  const avgSNR = snrCount > 0 ? snrSum / snrCount : null;
  const lossRate = totalExpected > 0 ? (totalLost / totalExpected) * 100 : -1;
  const fcntSpan = (minFcnt !== null && maxFcnt !== null && maxFcnt >= minFcnt) ? maxFcnt - minFcnt : -1;

  return {
    total: {
      nodes: filteredNodes.length,
      uniquePackets: totalUniquePackets,
      totalWithDuplicates: totalWithDuplicates,
      expected: totalExpected,
      lost: totalLost,
      lossRate: lossRate,
      avgRSSI: avgRSSI,
      avgSNR: avgSNR,
      firstTime: earliestTime ? earliestTime.toISOString() : null,
      lastTime: latestTime ? latestTime.toISOString() : null,
      fcntSpan: fcntSpan,
      resetCount: totalResetCount,
      duplicatePackets: totalDuplicatePackets,
      dataRatesUsed: Array.from(allDataRates).sort()
    },
    daily: [] // 簡化：不重建每日統計
  };
}

/** 讀取 UI 過濾條件 (時間 & gap & fcnt) */
function collectFilterOptions() {
  // 時間篩選現在預設啟用，只要有值就使用
  const startVal = document.getElementById('startDate')?.value;
  const endVal = document.getElementById('endDate')?.value;
  const filterWindow = {};
  if (startVal) filterWindow.start = parseDateTimeLocalWithTZ(startVal, currentTimezone);
  if (endVal) filterWindow.end = parseDateTimeLocalWithTZ(endVal, currentTimezone);
  
  // gap -> 以分鐘為單位，僅分析階段需要紀錄 gap => gapThresholdMinutes; 這裡提供給 buildAnalytics
  const gapEnabled = document.getElementById('useNoDataDuration')?.checked;
  const gapMinutes = parseFloat(document.getElementById('noDataDuration')?.value || '');
  const gapThresholdMinutes = (gapEnabled && !isNaN(gapMinutes) && gapMinutes > 0) ? gapMinutes : undefined;
  
  // Inactive Since -> 以整體最後時間為基準，節點最後上傳至整體最後時間的間隔（分鐘）
  const inactiveEnabled = document.getElementById('useInactiveSince')?.checked;
  const inactiveVal = parseFloat(document.getElementById('inactiveSinceMinutes')?.value || '');
  const inactiveSinceMinutes = (inactiveEnabled && !isNaN(inactiveVal) && inactiveVal > 0) ? inactiveVal : undefined;
  
  // FCNT Issue 篩選
  const fcntIssueEnabled = document.getElementById('useFcntIssue')?.checked;
  const fcntIssueThreshold = parseInt(document.getElementById('fcntrIssueThreshold')?.value || '1');
  const fcntFilter = (fcntIssueEnabled && !isNaN(fcntIssueThreshold) && fcntIssueThreshold > 0) ? 
    { enabled: true, threshold: fcntIssueThreshold } : { enabled: false };
  
  // Debug: 輸出收集到的篩選選項
  console.log('[App] Collected filter options:', {
    gapEnabled,
    gapMinutes,
    gapThresholdMinutes,
    inactiveEnabled,
    inactiveSinceMinutes,
    fcntIssueEnabled,
    fcntIssueThreshold,
    fcntFilter
  });
  
  return { filterWindow, gapThresholdMinutes, fcntFilter, inactiveSinceMinutes };
}

/** 重建 / 更新 analytics 並刷新視圖 */
function rebuildAnalytics() {
  if (!rawRecords.length) return;
  const threshold = parseFloat(document.getElementById('threshold')?.value) || 0;
  const { filterWindow, gapThresholdMinutes, fcntFilter, inactiveSinceMinutes } = collectFilterOptions();
  
  // 建立階層式分類配置，包含所有篩選選項
  const classification = buildClassificationConfig({
    threshold,
    fcntFilter,
  gapThresholdMinutes,
  inactiveSinceMinutes
  });
  
  console.log('[App] Building analytics with hierarchical classification:', { threshold, fcntFilter, gapThresholdMinutes });
  
  // 使用階層式分類邏輯，不需要額外篩選
  const { analytics } = buildAnalytics(rawRecords, { classification, filterWindow, gapThresholdMinutes, timezone: currentTimezone });
  
  // 注意：不再進行額外的節點篩選，因為分類邏輯已經處理了所有情況
  // 所有節點都會被保留，只是重新分類為 normal/abnormal/exception
  currentAnalytics = analytics;
  renderBarChart(analytics);
  showNodeStatistics(analytics.perNode);
  console.log('[App] Analytics rebuilt with hierarchical classification', analytics);
}

/** 設定所有事件監聽 */
function setupEventListeners() {
  // CSV 檔案
  document.getElementById('csvFile')?.addEventListener('change', handleFileChange);
  
  // 拖放上傳功能
  setupDragAndDrop();
  
  // Threshold slider/input
  document.getElementById('threshold')?.addEventListener('input', handleThresholdChange);
  // Gap 條件 (勾選才顯示 Gaps 分頁/內容)
  document.getElementById('useNoDataDuration')?.addEventListener('change', () => {
    updateGapTabVisibility();
    rebuildAnalytics();
    refreshOverlayIfOpen();
  });
  document.getElementById('noDataDuration')?.addEventListener('input', () => rebuildAnalytics());
  // Inactive Since 條件
  document.getElementById('useInactiveSince')?.addEventListener('change', () => rebuildAnalytics());
  document.getElementById('inactiveSinceMinutes')?.addEventListener('input', () => rebuildAnalytics());
  // FCNT Issue 條件
  document.getElementById('useFcntIssue')?.addEventListener('change', () => rebuildAnalytics());
  document.getElementById('fcntrIssueThreshold')?.addEventListener('input', () => rebuildAnalytics());
  // 時間視窗（移除 checkbox 監聽器，只監聽日期輸入）
  document.getElementById('startDate')?.addEventListener('input', () => {
    rebuildAnalytics();
    refreshOverlayIfOpen();
  });
  document.getElementById('endDate')?.addEventListener('input', () => {
    rebuildAnalytics();
    refreshOverlayIfOpen();
  });
  // 顯示所有節點狀態按鈕
  document.getElementById('showAllNodesBtn')?.addEventListener('click', handleShowAllNodes);
  // Tabs (Overlay 已在 table-manager 內部處理)
}

/**
 * 依據「No Data Gap」checkbox 是否勾選，顯示/隱藏 Gaps 分頁與內容
 * - 未勾選：隱藏分頁按鈕與內容（不可點擊 / 不顯示 gapSummary 等）
 * - 勾選：顯示分頁按鈕與內容
 * 若目前作用中的分頁被隱藏，切換回基本資訊分頁
 */
function updateGapTabVisibility() {
  const enabled = document.getElementById('useNoDataDuration')?.checked;
  const gapTabBtn = document.querySelector('.tabs .tab-button[data-tab="nodeGapChart"]');
  const gapTabContent = document.getElementById('nodeGapChart');
  if (!gapTabBtn || !gapTabContent) return; // 結構不存在直接略過

  if (!enabled) {
    // 隱藏按鈕與內容
    gapTabBtn.style.display = 'none';
    gapTabContent.style.display = 'none';
    // 若原本是 active，切回 basicInfo
    if (gapTabBtn.classList.contains('active')) {
      gapTabBtn.classList.remove('active');
      const basicBtn = document.querySelector('.tabs .tab-button[data-tab="basicInfo"]');
      const basicContent = document.getElementById('basicInfo');
      if (basicBtn && basicContent) {
        // 清除其它 active
        document.querySelectorAll('.tabs .tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        basicBtn.classList.add('active');
        basicContent.classList.remove('hidden');
      }
    }
  } else {
    // 顯示按鈕與內容（內容僅在被選取時顯示，維持原本 hidden 狀態）
    gapTabBtn.style.display = '';
    gapTabContent.style.display = '';
  }
}

/** 設定拖放上傳功能 */
function setupDragAndDrop() {
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('csvFile');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const removeBtn = document.getElementById('removeFileBtn');

  if (!uploadZone || !fileInput) return;

  // 點擊上傳區域時觸發檔案選擇
  uploadZone.addEventListener('click', () => {
    fileInput.click();
  });

  // 拖放事件處理
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!uploadZone.contains(e.relatedTarget)) {
      uploadZone.classList.remove('drag-over');
    }
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      
      // 檢查檔案類型
      if (!file.name.toLowerCase().endsWith('.csv')) {
        showUploadError('請選擇 CSV 檔案');
        return;
      }
      
      // 設定檔案到 input 元素
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      
      // 觸發檔案變更事件
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      // 顯示檔案資訊
      showFileInfo(file);
    }
  });

  // 移除檔案按鈕
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearFileSelection();
    });
  }
}

/** 顯示檔案資訊 */
function showFileInfo(file) {
  const uploadZone = document.getElementById('uploadZone');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');

  if (!fileInfo || !fileName || !fileSize) return;

  // 格式化檔案大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 更新 UI
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
  
  // 顯示檔案資訊，隱藏上傳區域的部分內容
  fileInfo.style.display = 'flex';
  uploadZone.classList.add('file-selected');
}

/** 清除檔案選擇 */
function clearFileSelection() {
  const fileInput = document.getElementById('csvFile');
  const uploadZone = document.getElementById('uploadZone');
  const fileInfo = document.getElementById('fileInfo');

  if (fileInput) {
    fileInput.value = '';
  }
  
  if (fileInfo) {
    fileInfo.style.display = 'none';
  }
  
  if (uploadZone) {
    uploadZone.classList.remove('file-selected', 'upload-error');
  }

  // 清除分析結果
  rawRecords = [];
  currentAnalytics = null;
  
  // 清除圖表和表格
  if (window.clearBarChart) {
    window.clearBarChart();
  }
  if (window.clearNodeTable) {
    window.clearNodeTable();
  }
  
  // 使用 table-manager 的初始化函數來重新設定表格
  if (window.initializeTable) {
    window.initializeTable();
  }
  
  // 清除任何可能開啟的 overlay
  const nodeOverlay = document.getElementById('nodeOverlay');
  if (nodeOverlay && !nodeOverlay.classList.contains('hidden')) {
    nodeOverlay.classList.add('hidden');
  }
  
  // 重置設定欄位到預設值
  const thresholdInput = document.getElementById('threshold');
  if (thresholdInput) {
    thresholdInput.value = '0';
  }
  
  const startDateInput = document.getElementById('startDate');
  if (startDateInput) {
    startDateInput.value = '';
  }
  
  const endDateInput = document.getElementById('endDate');
  if (endDateInput) {
    endDateInput.value = '';
  }
  
  const useFcntIssue = document.getElementById('useFcntIssue');
  if (useFcntIssue) {
    useFcntIssue.checked = false;
  }
  
  const useNoDataDuration = document.getElementById('useNoDataDuration');
  if (useNoDataDuration) {
    useNoDataDuration.checked = false;
  }
  const useInactiveSince = document.getElementById('useInactiveSince');
  if (useInactiveSince) {
    useInactiveSince.checked = false;
  }
  
  console.log('[App] File selection cleared, all data and statistics removed');
}

/** 顯示上傳錯誤 */
function showUploadError(message) {
  const uploadZone = document.getElementById('uploadZone');
  
  if (uploadZone) {
    uploadZone.classList.add('upload-error');
    
    // 顯示錯誤訊息
    alert(message);
    
    // 3秒後移除錯誤狀態
    setTimeout(() => {
      uploadZone.classList.remove('upload-error');
    }, 3000);
  }
}

/** 如果 overlay 開啟，重新載入其內容以反映時間範圍的變更 */
function refreshOverlayIfOpen() {
  const overlay = document.getElementById('nodeOverlay');
  if (!overlay || overlay.classList.contains('hidden')) {
    return; // Overlay 沒有開啟，不需要更新
  }
  
  // 取得目前 overlay 顯示的設備資訊
  const titleElement = document.getElementById('overlayTitle');
  if (!titleElement || !titleElement.textContent) {
    return; // 沒有有效的 overlay 內容
  }
  
  // 從標題解析設備名稱和地址
  const titleText = titleElement.textContent;
  const match = titleText.match(/Device:\s*(.+?)\s*\(addr:\s*(.+?)\)/);
  if (!match) {
    console.warn('[App] Cannot parse overlay title:', titleText);
    return;
  }
  
  const devname = match[1].trim();
  const devaddr = match[2].trim();
  
  console.log('[App] Refreshing overlay content for:', devname, devaddr);
  
  // 更新時間範圍顯示
  const timeRange = window.getTimeRangeFilter ? window.getTimeRangeFilter() : {};
  const timeRangeElement = document.getElementById('overlayTimeRange');
  if (timeRangeElement) {
    if (timeRange.start || timeRange.end) {
      const parts = [];
      if (timeRange.start) {
  parts.push(`開始時間: ${timeRange.start.toLocaleString('zh-TW', { timeZone: currentTimezone })} (${currentTimezone})`);
      }
      if (timeRange.end) {
  parts.push(`結束時間: ${timeRange.end.toLocaleString('zh-TW', { timeZone: currentTimezone })} (${currentTimezone})`);
      }
      timeRangeElement.textContent = `時間篩選範圍 - ${parts.join(' | ')}`;
    } else {
      timeRangeElement.textContent = '時間篩選範圍 - 全部資料';
    }
  }
  
  // 重新載入 overlay 內容
  if (window.populateBasicInfo) {
    window.populateBasicInfo(devname, devaddr);
  }
  if (window.populateNodeDataTable) {
    window.populateNodeDataTable(devname, devaddr);
  }
  if (window.populateNodeCharts) {
    window.populateNodeCharts(devname, devaddr);
  }
  // 更新圖表而不是重新創建（更高效）
  if (window.updateNodeUpFreqChart) {
    window.updateNodeUpFreqChart(devname, devaddr);
  } else if (window.createNodeUpFreqChart) {
    window.createNodeUpFreqChart(devname, devaddr);
  }
  if (window.updateNodeGwBarChart) {
    window.updateNodeGwBarChart(devname, devaddr);
  } else if (window.createNodeGwBarChart) {
    window.createNodeGwBarChart(devname, devaddr);
  }
}

/** 檔案選擇處理 */
async function handleFileChange(e) {
  const file = e.target.files?.[0];
  if (!file) {
    clearFileSelection();
    return;
  }
  
  // 檢查檔案類型
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showUploadError('請選擇 CSV 檔案');
    e.target.value = ''; // 清除無效檔案
    return;
  }
  
  try {
    showLoadingState();
    
    // 顯示檔案資訊
    showFileInfo(file);
    
  const text = await file.text();
  originalCsvText = text;
  rawRecords = parseCSVRaw(text, { timezone: currentTimezone });
  console.log('[App] Parsed records:', rawRecords.length, 'timezone:', currentTimezone);
    
    // 如果有資料且 checkbox 未被勾選，自動填入時間範圍
    autoFillDateRange(rawRecords);
    
    rebuildAnalytics();
    
    // 顯示成功狀態
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
      uploadZone.classList.remove('upload-error');
      uploadZone.classList.add('file-selected');
    }
    
  } catch (err) {
    console.error(err);
    showUploadError('CSV 解析失敗: ' + (err.message || err));
    clearFileSelection();
  } finally {
    hideLoadingState();
  }
}

/** Threshold 變動 -> 重新分類 + Chart */
function handleThresholdChange() {
  if (!rawRecords.length) return;
  rebuildAnalytics();
}

/** 顯示所有節點狀態 - 不套用篩選條件，顯示原始匯入資料在指定時間範圍內的狀態 */
function handleShowAllNodes() {
  if (!rawRecords.length) {
    alert('請先匯入 CSV 檔案');
    return;
  }
  
  console.log('[App] Showing all nodes status in time range...');
  
  // 收集時間範圍篩選條件（只使用時間範圍，忽略其他篩選條件）
  const { filterWindow, gapThresholdMinutes, fcntFilter, inactiveSinceMinutes } = collectFilterOptions();
  
  // 重新分析所有資料，只使用 Loss Rate threshold，不使用其他篩選條件
  const threshold = parseFloat(document.getElementById('threshold')?.value) || 0;
  
  // 建立分類配置：沿用目前 UI 的例外規則設定，僅「不額外篩掉節點」
  // 說明：我們目前採用的是階層式分類，不會因為例外規則而過濾節點，只會用來標記分類與產生徽章
  const classification = buildClassificationConfig({
    threshold,
    fcntFilter,
    gapThresholdMinutes,
    inactiveSinceMinutes
  });
  
  console.log('[App] Building analytics for all nodes with classification:', classification);
  
  // 重新分析所有資料（不包含特殊篩選條件）
  const { analytics } = buildAnalytics(rawRecords, { 
    classification, 
    filterWindow, 
    // 保持 gap 分析設定以便產生每日與總覽的 GAP 相關徽章
    gapThresholdMinutes,
    timezone: currentTimezone
  });
  
  // 更新當前分析結果並刷新顯示
  currentAnalytics = analytics;
  renderBarChart(analytics);
  showNodeStatistics(analytics.perNode);
  
  console.log('[App] All nodes status displayed:', {
    totalNodes: analytics.perNode.length,
    timeRange: filterWindow
  });
  
  // 提供使用者回饋
  const startDate = document.getElementById('startDate')?.value;
  const endDate = document.getElementById('endDate')?.value;
  let timeRangeMsg = '全部時間範圍';
  
  if (startDate || endDate) {
    const parts = [];
    if (startDate) parts.push(`開始: ${new Date(startDate).toLocaleString('zh-TW')}`);
    if (endDate) parts.push(`結束: ${new Date(endDate).toLocaleString('zh-TW')}`);
    timeRangeMsg = parts.join(' | ');
  }
  
  // 暫時顯示成功訊息（可選）
  const button = document.getElementById('showAllNodesBtn');
  if (button) {
    const originalText = button.textContent;
    button.textContent = `已顯示 ${analytics.perNode.length} 個節點`;
    button.disabled = true;
    
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  }
}

/**
 * Show loading state
 */
function showLoadingState() {
  document.getElementById('csvFile') && (document.getElementById('csvFile').disabled = true);
  document.getElementById('threshold') && (document.getElementById('threshold').disabled = true);
  console.log('[App] Loading...');
}

/**
 * Hide loading state
 */
function hideLoadingState() {
  document.getElementById('csvFile') && (document.getElementById('csvFile').disabled = false);
  document.getElementById('threshold') && (document.getElementById('threshold').disabled = false);
  console.log('[App] Loading complete');
}

/**
 * Handle errors globally
 * @param {Error} error - Error to handle
 * @param {string} context - Context where error occurred
 */
function handleError(error, context = 'Unknown') {
  console.error(`[App][${context}]`, error);
  alert('Error: ' + (error.message || error));
}

/**
 * Utility function to check if all required modules are loaded
 * @returns {boolean} True if all modules are available
 */
function checkModulesLoaded() {
  const required = ['parseCSVRaw', 'buildAnalytics', 'renderBarChart', 'showNodeStatistics', 'initializeTableRelated'];
  const missing = required.filter(fn => typeof window[fn] !== 'function');
  if (missing.length) {
    console.error('[App] Missing functions:', missing);
    return false;
  }
  return true;
}

// Application startup
document.addEventListener('DOMContentLoaded', () => {
  if (!checkModulesLoaded()) return;
  initializeApp();
  initializeTableRelated();
  // 初始根據 checkbox 狀態決定是否顯示 Gaps 分頁
  updateGapTabVisibility();
  // 初始化時區下拉
  populateTimezoneDropdown();
  const tzSelect = document.getElementById('timezoneSelect');
  if (tzSelect) {
  // 原生 select 僅作為資料容器，行為已由自訂組件控制
  }
});

// 暴露全域（與舊版名稱不同避免衝突）
window.handleFileChange = handleFileChange;
window.handleThresholdChange = handleThresholdChange;
window.handleShowAllNodes = handleShowAllNodes;
window.rebuildAnalytics = rebuildAnalytics;
window.getCurrentAnalytics = () => currentAnalytics;
window.getRawRecords = () => rawRecords;
window.updateGapTabVisibility = updateGapTabVisibility;
window.getSelectedTimezone = getSelectedTimezone;
window.getOriginalCsvText = () => originalCsvText;
