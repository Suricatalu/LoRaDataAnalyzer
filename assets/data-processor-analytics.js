// Lightweight analytics processor for frequency and gateway statistics
// Implements: globalFrequencies, globalGateways, per-node frequenciesUsed/frequencyCounts and gatewaysUsed/gatewayCounts (daily + total)
// Designed for browser usage (attached to window) and CommonJS (module.exports) if available.

(function () {
  'use strict';

  function toDate(d) {
    if (!d) return null;
    return d instanceof Date ? d : new Date(d);
  }

  function toDateKeyUTC(date) {
    // YYYY-MM-DD in UTC
    const d = toDate(date);
    if (!d || isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }

  function uniqSorted(arr, mapFn) {
    const set = new Set();
    for (const v of arr) {
      const k = mapFn ? mapFn(v) : v;
      if (k != null && k !== '') set.add(k);
    }
    return Array.from(set).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
  }

  function freqKey(f) {
    // normalize frequency key to string (preserve decimal if present)
    if (f == null) return 'null';
    // ensure numeric if possible
    const n = Number(f);
    return Number.isFinite(n) ? String(n) : String(f);
  }

  function buildGlobalFrequencies(records) {
    const freqs = records
      .map((r) => (r && r.Freq != null ? Number(r.Freq) : null))
      .filter((f) => f != null && !isNaN(f));
    return uniqSorted(freqs);
  }

  function buildGlobalGateways(records) {
    const gateways = new Set();
    for (const r of records) {
      if (!r || !r.Mac) continue;
      let macArray = [];
      if (Array.isArray(r.Mac)) {
        macArray = r.Mac;
      } else if (typeof r.Mac === 'string' && r.Mac.trim()) {
        // 如果是字串，按換行符號分割
        macArray = r.Mac.split('\n').map(m => m.trim()).filter(m => m);
      }
      // 添加每個 Gateway MAC 地址到集合中
      macArray.forEach(gatewayMac => {
        if (gatewayMac) gateways.add(gatewayMac);
      });
    }
    return Array.from(gateways).sort();
  }

  function ensureFreqCountsTemplate(globalFrequencies) {
    const template = Object.create(null);
    for (const f of globalFrequencies) {
      template[freqKey(f)] = 0;
    }
    return template;
  }

  function ensureGatewayCountsTemplate(globalGateways) {
    const template = Object.create(null);
    for (const gw of globalGateways) {
      template[gw] = 0;
    }
    return template;
  }

  function cloneFreqTemplate(template) {
    const out = Object.create(null);
    for (const k in template) out[k] = 0;
    return out;
  }

  function cloneGatewayTemplate(template) {
    const out = Object.create(null);
    for (const k in template) out[k] = 0;
    return out;
  }

  function computeFrequenciesForRecords(records, globalFrequencies) {
    const template = ensureFreqCountsTemplate(globalFrequencies);
    const counts = cloneFreqTemplate(template);
    const usedSet = new Set();
    for (const r of records) {
      if (!r) continue;
      const f = r.Freq;
      if (f == null) continue;
      const k = freqKey(f);
      if (!(k in counts)) {
        // If a record contains a frequency not in globalFrequencies (shouldn't happen), add it
        counts[k] = 0;
      }
      counts[k] += 1;
      usedSet.add(Number(f));
    }
    const frequenciesUsed = uniqSorted(Array.from(usedSet));
    return { frequencyCounts: counts, frequenciesUsed };
  }

  function computeGatewaysForRecords(records, globalGateways) {
    const template = ensureGatewayCountsTemplate(globalGateways);
    const counts = cloneGatewayTemplate(template);
    const usedSet = new Set();
    
    for (const r of records) {
      if (!r || !r.Mac) continue;
      
      let macArray = [];
      if (Array.isArray(r.Mac)) {
        macArray = r.Mac;
      } else if (typeof r.Mac === 'string' && r.Mac.trim()) {
        // 如果是字串，按換行符號分割
        macArray = r.Mac.split('\n').map(m => m.trim()).filter(m => m);
      }
      
      // 為每個 Gateway MAC 增加計數（避免重複計數同一訊息）
      const seenInThisRecord = new Set();
      macArray.forEach(gatewayMac => {
        if (!gatewayMac || seenInThisRecord.has(gatewayMac)) return;
        seenInThisRecord.add(gatewayMac);
        
        if (!(gatewayMac in counts)) {
          // If a record contains a gateway not in globalGateways (shouldn't happen), add it
          counts[gatewayMac] = 0;
        }
        counts[gatewayMac] += 1;
        usedSet.add(gatewayMac);
      });
    }
    
    const gatewaysUsed = Array.from(usedSet).sort();
    return { gatewayCounts: counts, gatewaysUsed };
  }

  function groupBy(array, keyFn) {
    const map = new Map();
    for (const it of array) {
      const k = keyFn(it);
      const arr = map.get(k) || [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }

  function computeBasicNodeTotals(records) {
    // Minimal basic totals useful for UI. This does not implement full expected/loss logic.
    const totalWithDuplicates = records.length;
    const uniqueByFcnt = new Map();
    let rssiSum = 0,
      rssiCount = 0,
      snrSum = 0,
      snrCount = 0;
    for (const r of records) {
      if (r && r.Fcnt != null) uniqueByFcnt.set(r.Fcnt, (uniqueByFcnt.get(r.Fcnt) || 0) + 1);
      if (r && typeof r.RSSI === 'number') {
        rssiSum += r.RSSI; rssiCount += 1;
      }
      if (r && typeof r.SNR === 'number') {
        snrSum += r.SNR; snrCount += 1;
      }
    }
    const uniquePackets = uniqueByFcnt.size;
    const duplicatePackets = Math.max(0, totalWithDuplicates - uniquePackets);
    return {
      uniquePackets,
      totalWithDuplicates,
      duplicatePackets,
      avgRSSI: rssiCount ? rssiSum / rssiCount : null,
      avgSNR: snrCount ? snrSum / snrCount : null,
    };
  }

  function processAnalytics(records, opts = {}) {
    // records: array of RawRecord-like objects
    if (!Array.isArray(records)) throw new Error('records must be an array');

    // normalize time and frameType
    const normalized = records.map((r) => ({
      ...r,
      Time: r && r.Time ? toDate(r.Time) : null,
      FrameType: r && r.FrameType ? r.FrameType : undefined,
    }));

    // filter uplink records only for frequency/statistics per spec
    const upRecords = normalized.filter((r) => r && r.FrameType && r.FrameType.isUp);

    const globalFrequencies = buildGlobalFrequencies(upRecords);
    const globalGateways = buildGlobalGateways(upRecords);

    // group by Devaddr
    const byNode = groupBy(upRecords, (r) => (r && r.Devaddr ? r.Devaddr : 'unknown'));

    const perNode = [];
    for (const [devaddr, recs] of byNode.entries()) {
      const nodeId = { devName: (recs[0] && recs[0].Devname) || null, devAddr: devaddr };

      const totals = computeBasicNodeTotals(recs);

      // compute total frequencies for node
      const totalFreq = computeFrequenciesForRecords(recs, globalFrequencies);
      // compute total gateways for node
      const totalGw = computeGatewaysForRecords(recs, globalGateways);

      // compute daily groups and their frequency stats
      const groupedByDay = groupBy(recs, (r) => toDateKeyUTC(r.Time) || 'unknown');
      const daily = [];
      for (const [day, dayRecs] of groupedByDay.entries()) {
        const dayTotals = computeBasicNodeTotals(dayRecs);
        const dayFreq = computeFrequenciesForRecords(dayRecs, globalFrequencies);
        const dayGw = computeGatewaysForRecords(dayRecs, globalGateways);
        daily.push(Object.assign({ date: day }, dayTotals, {
          frequenciesUsed: dayFreq.frequenciesUsed,
          frequencyCounts: dayFreq.frequencyCounts,
          gatewaysUsed: dayGw.gatewaysUsed,
          gatewayCounts: dayGw.gatewayCounts,
        }));
      }

      perNode.push({
        id: nodeId,
        total: Object.assign({}, totals, {
          frequenciesUsed: totalFreq.frequenciesUsed,
          frequencyCounts: totalFreq.frequencyCounts,
          gatewaysUsed: totalGw.gatewaysUsed,
          gatewayCounts: totalGw.gatewayCounts,
        }),
        timeline: {
          firstTime: recs.length ? (recs[0].Time ? recs[0].Time.toISOString() : null) : null,
          lastTime: recs.length ? (recs[recs.length - 1].Time ? recs[recs.length - 1].Time.toISOString() : null) : null,
          fcntSpan: -1,
          resetCount: 0,
        },
        daily,
      });
    }

    const global = {
      total: {
        nodes: perNode.length,
        frequenciesUsed: globalFrequencies,
        gatewaysUsed: globalGateways,
      },
      daily: [],
    };

    return {
      records: normalized,
      analytics: {
        perNode,
        global,
        threshold: {},
        meta: {
          generatedAt: new Date().toISOString(),
          version: opts.version || '0.0.0',
          includeDownlinkInQuality: false,
          lossRateScope: 'uplink-only',
          resetRule: 'any-decrease',
          filterWindow: { start: null, end: null, inclusiveStart: false, inclusiveEnd: false, excluded: 0 },
          timeRange: { start: null, end: null, days: 0 },
        },
      },
    };
  }

  // export
  const api = { processAnalytics, buildGlobalFrequencies, buildGlobalGateways };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.DataProcessorAnalytics = api;
  if (typeof define === 'function' && define.amd) define(() => api);

})();
/*
 * Analytics Processor v2.1 (buildAnalytics)
 *
 * 依據 doc/Analysis.md 最終版規格，從 RawRecord[] 生成 AnalyticsContainer。
 * 側重：pure function 計算，不與 UI 綁定；可直接在瀏覽器或 Node 環境執行。
 *
 * 提供：
 *  - buildAnalytics(records, options)
 *  - 預設簡易 classification 規則 (可覆寫)
 *  - 各內部計算小工具 (未 export) 以便維護
 *
 * 假設：輸入 records 已由 parseCSVRaw 標準化；Time 為 Date 物件。
 *
 * 重要設計決策與與文件可能的細微解釋：
 * 1. 遺失率 / duplicates / expected 僅考慮具備有效 Fcnt 的上行紀錄 (FrameType?.isUp)。Fcnt 缺失的紀錄仍可貢獻品質 (RSSI/SNR) 與 dataRatesUsed。
 * 2. global.total 與 global.daily 依文件描述「直接重跑一次與節點相同邏輯」，此實作將所有上行紀錄視為單一集合排序運算（注意：跨不同 Devaddr 混合會產生額外 reset / segment 分段的可能性；若後續確認需改為彙總 perNode 再加總，可調整 aggregateGlobal 方法）。
 * 3. threshold.list 為每日分類摘要；分類依每日單日 NodeDailyStat 的指標重新跑 rule-based（非整體總計）。
 * 4. lossRate sentinel：expected=0 時 lossRate = -1 並將 lost=0。
 * 5. fcntSpan：不足兩筆有效 Fcnt (或只有一筆) 則為 -1。
 * 6. 重置判定：currFcnt < prevFcnt。
 * 7. 分類：第一個命中規則即採用；未命中則 defaultCategory；額外類別會被映射為 abnormal（若不是 normal 或 exception）。
 * 8. NodeDailyStat.total = uniquePackets（文件示例一致）。
 * 9. 若提供 options.gapThresholdMinutes，啟用相鄰兩筆上行紀錄時間差 > 閾值的 gap 偵測並輸出 lossGapFcnt / lossGapTime / gapCount / maxGapMinutes / gapThresholdMinutes。
 *
 * 可擴充 TODO：
 *  - 支援增量更新 (維持 perNode 狀態快取)
 *  - 提供計算模式選項 (global 改為加總 perNode 或保持目前 "single stream" )
 *  - 增加 metrics 註冊機制
 */

/** @typedef {import('./data-processor-raw.js').RawRecord} RawRecord */

// =============================
// 預設 Classification 規則 (可被 options.classification 覆寫)
// =============================
const DEFAULT_CLASSIFICATION = {
  version: '1.0.0',
  defaultCategory: 'normal',
  rules: [
    { metric: 'lossRate', op: '>', value: 5, category: 'abnormal', note: 'lossRate > 5%' }
  ],
  metricsAlias: { lossRate: 'Loss Rate %', resetCount: 'FCnt Resets' }
};

// =============================
// 公開主函式
// =============================
/**
 * 建立 analytics 容器
 * @param {RawRecord[]} records - parseCSVRaw 後的標準 RawRecord 陣列
 * @param {Object} [options]
 * @param {{start?:string|Date|null,end?:string|Date|null,inclusiveStart?:boolean,inclusiveEnd?:boolean}} [options.filterWindow]
 * @param {Object} [options.classification] - 覆寫 classification config
 * @param {string} [options.version] - analytics meta version
 * @param {number} [options.gapThresholdMinutes] - 啟用 gap 偵測的分鐘閾值 (>0)
 * @returns {{records:RawRecord[], analytics: AnalyticsContainer}}
 */
function buildAnalytics(records, options = {}) {
  const version = options.version || '2.0.0';
  const classification = options.classification || DEFAULT_CLASSIFICATION;
  const gapThresholdMinutes = typeof options.gapThresholdMinutes === 'number' && options.gapThresholdMinutes > 0 ? options.gapThresholdMinutes : undefined;
  const dailyFill = normalizeDailyFill(options.dailyFill);

  

  // 1. 時間視窗過濾
  const fw = normalizeFilterWindow(options.filterWindow);
  const { filteredRecords, excludedCount } = applyFilterWindow(records, fw);

  // 2. 僅上行
  const upRecords = filteredRecords.filter(r => r.FrameType && r.FrameType.isUp);

  // build global frequencies baseline
  const globalFrequencies = buildGlobalFrequencies(upRecords);
  // build global gateways baseline  
  const globalGateways = buildGlobalGateways(upRecords);

  // 3. 分組 per node (以 Devaddr 為主 key；保留第一個 devName)
  const nodeMap = groupByNode(upRecords);

  // 4. 計算 perNode 統計
  const perNode = Array.from(nodeMap.values()).map(entry => calcNodeStat(entry, { gapThresholdMinutes, globalFrequencies, globalGateways }));

  // 4.A 無資料日補齊（依 timeRange 內所有日期）
  const timeRange = calcTimeRange(filteredRecords);
  const allDates = buildDateList(timeRange.start, timeRange.end);
  if (dailyFill.enabled && perNode.length && allDates.length) {
    fillPerNodeMissingDaily(perNode, allDates, {
      globalFrequencies,
      globalGateways,
      expectedBaseline: dailyFill.expectedBaseline,
      fixedExpected: dailyFill.fixedExpected,
      minExpected: dailyFill.minExpected
    });
  }

  // 5. 全域統計 (重跑一次)
  let global = calcGlobal(upRecords);
  // attach frequenciesUsed baseline to global.total
  global.total.frequenciesUsed = globalFrequencies;
  // attach gatewaysUsed baseline to global.total
  global.total.gatewaysUsed = globalGateways;

  // 5.A 以補齊後 perNode.daily 重建 global.daily，並加入 nodesTotal
  if (perNode.length && allDates.length) {
    global.daily = aggregateGlobalDailyFromPerNode(perNode, allDates);
    // nodesTotal 為固定總節點數
    for (const d of global.daily) d.nodesTotal = perNode.length;
  }

  // 6. 推導每日 threshold 三分類視圖 (rule-based -> 三類)
  const threshold = buildThresholdView(perNode, classification, { upRecords, gapThresholdMinutes, endBoundary: fw.end });

  // 7. Meta
  const meta = buildMeta({ version, excludedCount, filterWindow: fw, timeRange, classification, dailyFill });

  // 輸出當前使用的分類配置
  console.log('[Analytics] Current Classification Config:', classification);

  return {
    records: filteredRecords,
    analytics: { perNode, global, threshold, meta }
  };
}

// =============================
// 型別 JSDoc（僅供 IDE 提示）
// =============================
/**
 * @typedef {Object} NodeDailyStat
 * @property {string} date
 * @property {number} total
 * @property {number} expected
 * @property {number} lost
 * @property {number} lossRate
 * @property {number|null} avgRSSI
 * @property {number|null} avgSNR
 * @property {string|null} firstTime
 * @property {string|null} lastTime
 * @property {number} fcntSpan
 * @property {number} duplicatePackets
 * @property {number} totalWithDuplicates
 * @property {number} resetCount
 * @property {string[]} dataRatesUsed
 * @property {Array<[number|null,number|null]>} [lossGapFcnt]
 * @property {Array<[string|null,string|null]>} [lossGapTime]
 * @property {boolean} [noData]
 * @property {'fcnt'|'baseline-fixed'|'baseline-median'|'interpolated'} [expectedSource]
 * @property {number} [baselineExpected]
 */
/**
 * @typedef {Object} NodeStat
 * @property {{devName:string,devAddr:string}} id
 * @property {{uniquePackets:number,totalWithDuplicates:number,expected:number,lost:number,lossRate:number,duplicatePackets:number,resetCount:number,avgRSSI:number|null,avgSNR:number|null,dataRatesUsed:string[],lossGapFcnt?:Array<[number|null,number|null]>,lossGapTime?:Array<[string|null,string|null]>,gapThresholdMinutes?:number}} total
 * @property {{firstTime:string|null,lastTime:string|null,fcntSpan:number,resetCount:number}} timeline
 * @property {NodeDailyStat[]} daily
 */
/**
 * @typedef {Object} GlobalDailyStat
 * @property {string} date
 * @property {number} nodes
 * @property {number} [nodesTotal]
 * @property {number} uniquePackets
 * @property {number} totalWithDuplicates
 * @property {number} expected
 * @property {number} lost
 * @property {number} lossRate
 * @property {number|null} avgRSSI
 * @property {number|null} avgSNR
 * @property {string|null} firstTime
 * @property {string|null} lastTime
 * @property {number} fcntSpan
 * @property {number} resetCount
 * @property {number} duplicatePackets
 * @property {string[]} dataRatesUsed
 */
/**
 * @typedef {Object} GlobalStat
 * @property {{nodes:number,uniquePackets:number,totalWithDuplicates:number,expected:number,lost:number,lossRate:number,avgRSSI:number|null,avgSNR:number|null,firstTime:string|null,lastTime:string|null,fcntSpan:number,resetCount:number,duplicatePackets:number,dataRatesUsed:string[]}} total
 * @property {GlobalDailyStat[]} daily
 */
/**
 * @typedef {Object} ThresholdView
 * @property {{normalcnt:number,abnormalcnt:number,exceptioncnt:number,normal:string[],abnormal:string[],exception:string[]}} total
 * @property {{date:string,normalcnt:number,abnormalcnt:number,exceptioncnt:number,normal:string[],abnormal:string[],exception:string[]}[]} list
 * @property {Record<string, any[]>} [byDate]
 * @property {number} [thresholdValue]
 * @property {number} [exceptionResetThreshold]
 * @property {string} [exceptionRule]
 */
/**
 * @typedef {Object} AnalyticsMeta
 * @property {string} generatedAt
 * @property {string} version
 * @property {false} includeDownlinkInQuality
 * @property {'uplink-only'} lossRateScope
 * @property {'any-decrease'} resetRule
 * @property {Object} [classification]
 * @property {{enabled:boolean,mode:'no-data-100-loss',expectedBaseline:'per-node-daily-median'|'fixed',fixedExpected?:number,minExpected?:number}} [dailyFill]
 * @property {{start:string|null,end:string|null,inclusiveStart:boolean,inclusiveEnd:boolean,excluded:number}} filterWindow
 * @property {{start:string|null,end:string|null,days:number}} timeRange
 */
/** @typedef {{perNode:NodeStat[],global:GlobalStat,threshold:ThresholdView,meta:AnalyticsMeta}} AnalyticsContainer */

// =============================
// 工具: 時間 / 分組
// =============================
function toDateKey(d) { return d.toISOString().slice(0,10); }
function isValidNumber(n) { return typeof n === 'number' && !Number.isNaN(n); }

// ========== Frequency helpers ==========
function freqKey(f) {
  if (f == null) return 'null';
  const n = Number(f);
  return Number.isFinite(n) ? String(n) : String(f);
}
function uniqSortedNumeric(arr) {
  const set = new Set();
  for (const v of arr) if (v != null && v !== '' && !Number.isNaN(Number(v))) set.add(Number(v));
  return Array.from(set).sort((a,b)=>a-b);
}
function buildGlobalFrequencies(records) {
  const freqs = records.map(r => (r && r.Freq != null ? Number(r.Freq) : null)).filter(f => f != null && !isNaN(f));
  return uniqSortedNumeric(freqs);
}
function ensureFreqCountsTemplate(globalFrequencies) {
  const t = Object.create(null);
  for (const f of globalFrequencies) t[freqKey(f)] = 0;
  return t;
}
function cloneFreqTemplate(template) { const out = Object.create(null); for (const k in template) out[k]=0; return out; }
function computeFrequenciesForRecords(records, globalFrequencies) {
  const template = ensureFreqCountsTemplate(globalFrequencies || []);
  const counts = cloneFreqTemplate(template);
  const used = new Set();
  for (const r of records) {
    if (!r) continue;
    const f = r.Freq;
    if (f == null || Number.isNaN(Number(f))) continue;
    const k = freqKey(f);
    if (!(k in counts)) counts[k] = 0; // allow unexpected freqs
    counts[k] += 1;
    used.add(Number(f));
  }
  return { frequencyCounts: counts, frequenciesUsed: uniqSortedNumeric(Array.from(used)) };
}

// ========== Gateway helpers ==========
function buildGlobalGateways(records) {
  const gateways = new Set();
  for (const r of records) {
    if (!r || !r.Mac) continue;
    let macArray = [];
    if (Array.isArray(r.Mac)) {
      macArray = r.Mac;
    } else if (typeof r.Mac === 'string' && r.Mac.trim()) {
      // 如果是字串，按換行符號分割
      macArray = r.Mac.split('\n').map(m => m.trim()).filter(m => m);
    }
    // 添加每個 Gateway MAC 地址到集合中
    macArray.forEach(gatewayMac => {
      if (gatewayMac) gateways.add(gatewayMac);
    });
  }
  return Array.from(gateways).sort();
}
function ensureGatewayCountsTemplate(globalGateways) {
  const t = Object.create(null);
  for (const gw of globalGateways) t[gw] = 0;
  return t;
}
function cloneGatewayTemplate(template) { const out = Object.create(null); for (const k in template) out[k]=0; return out; }
function computeGatewaysForRecords(records, globalGateways) {
  const template = ensureGatewayCountsTemplate(globalGateways || []);
  const counts = cloneGatewayTemplate(template);
  const used = new Set();
  
  for (const r of records) {
    if (!r || !r.Mac) continue;
    
    let macArray = [];
    if (Array.isArray(r.Mac)) {
      macArray = r.Mac;
    } else if (typeof r.Mac === 'string' && r.Mac.trim()) {
      // 如果是字串，按換行符號分割
      macArray = r.Mac.split('\n').map(m => m.trim()).filter(m => m);
    }
    
    // 為每個 Gateway MAC 增加計數（避免重複計數同一訊息）
    const seenInThisRecord = new Set();
    macArray.forEach(gatewayMac => {
      if (!gatewayMac || seenInThisRecord.has(gatewayMac)) return;
      seenInThisRecord.add(gatewayMac);
      
      if (!(gatewayMac in counts)) {
        // If a record contains a gateway not in globalGateways (shouldn't happen), add it
        counts[gatewayMac] = 0;
      }
      counts[gatewayMac] += 1;
      used.add(gatewayMac);
    });
  }
  
  return { gatewayCounts: counts, gatewaysUsed: Array.from(used).sort() };
}

function normalizeFilterWindow(fw = {}) {
  let { start=null, end=null, inclusiveStart=false, inclusiveEnd=false } = fw;
  if (start) start = typeof start === 'string' ? new Date(start) : start;
  if (end) end = typeof end === 'string' ? new Date(end) : end;
  if (start && isNaN(start.getTime())) start = null;
  if (end && isNaN(end.getTime())) end = null;
  return { start, end, inclusiveStart: !!inclusiveStart, inclusiveEnd: !!inclusiveEnd };
}

function normalizeDailyFill(fill = {}) {
  const enabled = fill.enabled !== false; // 預設啟用
  const mode = 'no-data-100-loss';
  const expectedBaseline = fill.expectedBaseline === 'fixed' ? 'fixed' : 'per-node-daily-median';
  const fixedExpected = Number.isFinite(fill.fixedExpected) && fill.fixedExpected > 0 ? Math.floor(fill.fixedExpected) : 1;
  const minExpected = Number.isFinite(fill.minExpected) && fill.minExpected > 0 ? Math.floor(fill.minExpected) : 1;
  return { enabled, mode, expectedBaseline, fixedExpected, minExpected };
}

function buildDateList(startISO, endISO) {
  if (!startISO || !endISO) return [];
  const startKey = startISO.slice(0,10);
  const endKey = endISO.slice(0,10);
  const days = dateDiffDays(startKey, endKey) + 1;
  const list = [];
  let t = Date.parse(startKey + 'T00:00:00Z');
  for (let i=0; i<days; i++) {
    const d = new Date(t + i*86400000).toISOString().slice(0,10);
    list.push(d);
  }
  return list;
}

function median(nums) {
  if (!nums || !nums.length) return NaN;
  const arr = nums.slice().sort((a,b)=>a-b);
  const mid = Math.floor(arr.length/2);
  return arr.length % 2 ? arr[mid] : (arr[mid-1]+arr[mid])/2;
}

function applyFilterWindow(records, fw) {
  if (!fw.start && !fw.end) return { filteredRecords: records.slice(), excludedCount: 0};
  const filtered = []; let excluded = 0;
  for (const r of records) {
    const t = r.Time;
    if (fw.start) {
      if (fw.inclusiveStart) { if (t < fw.start) { excluded++; continue; } }
      else { if (t <= fw.start) { excluded++; continue; } }
    }
    if (fw.end) {
      if (fw.inclusiveEnd) { if (t > fw.end) { excluded++; continue; } }
      else { if (t >= fw.end) { excluded++; continue; } }
    }
    filtered.push(r);
  }
  return { filteredRecords: filtered, excludedCount: excluded };
}

function groupByNode(upRecords) {
  const map = new Map();
  for (const r of upRecords) {
    const key = r.Devaddr;
    if (!map.has(key)) map.set(key, { devAddr: r.Devaddr, devName: r.Devname, records: [] });
    map.get(key).records.push(r);
  }
  return map;
}

// =============================
// 核心計算：節點統計
// =============================
function calcNodeStat(entry, { gapThresholdMinutes, globalFrequencies, globalGateways } = {}) {
  const records = entry.records.slice().sort((a,b)=>a.Time - b.Time);
  // Quality 只看上行 (已過濾)；RSSI/SNR NaN 不算
  const qualityAgg = { rssiSum:0, rssiCount:0, snrSum:0, snrCount:0 };
  const dataRates = new Set();

  const fcntRecords = []; // with valid Fcnt
  for (const r of records) {
    if (isValidNumber(r.RSSI)) { qualityAgg.rssiSum += r.RSSI; qualityAgg.rssiCount++; }
    if (isValidNumber(r.SNR)) { qualityAgg.snrSum += r.SNR; qualityAgg.snrCount++; }
    if (r.Datarate) dataRates.add(r.Datarate);
    if (isValidNumber(r.Fcnt)) fcntRecords.push(r);
  }

  const { uniquePackets, totalWithDuplicates, duplicatePackets, expected, lost, lossRate, resetCount, fcntSpan, firstTime, lastTime } = computeCounters(fcntRecords);

  // gap detection (以分鐘為單位)
  let lossGapFcnt, lossGapTime, gapCount, maxGapMinutes;
  if (gapThresholdMinutes) {
    const gapThresholdMs = gapThresholdMinutes * 60000; // 轉換為毫秒用於計算
    lossGapFcnt = [];
    lossGapTime = [];
    maxGapMinutes = -1;
    for (let i=0;i<records.length-1;i++) {
      const a = records[i];
      const b = records[i+1];
      const diffMs = b.Time - a.Time;
      if (diffMs > gapThresholdMs) {
        lossGapFcnt.push([isValidNumber(a.Fcnt)?a.Fcnt:null, isValidNumber(b.Fcnt)?b.Fcnt:null]);
        lossGapTime.push([a.Time.toISOString(), b.Time.toISOString()]);
        const diffMinutes = diffMs / 60000; // 轉換為分鐘
        if (diffMinutes > maxGapMinutes) maxGapMinutes = diffMinutes;
      }
    }
    gapCount = lossGapFcnt.length;
    if (!gapCount) maxGapMinutes = -1;
  }

  const daily = buildNodeDaily(records, gapThresholdMinutes, globalFrequencies, globalGateways);

  // compute frequency and gateway stats for total
  const freqStats = computeFrequenciesForRecords(records, globalFrequencies);
  const gwStats = computeGatewaysForRecords(records, globalGateways);

  return {
    id: { devName: entry.devName, devAddr: entry.devAddr },
    total: { 
      uniquePackets, 
      totalWithDuplicates, 
      expected, 
      lost, 
      lossRate, 
      duplicatePackets, 
      resetCount,
      avgRSSI: qualityAgg.rssiCount ? qualityAgg.rssiSum / qualityAgg.rssiCount : null,
      avgSNR: qualityAgg.snrCount ? qualityAgg.snrSum / qualityAgg.snrCount : null,
      dataRatesUsed: Array.from(dataRates).sort(),
      ...(gapThresholdMinutes ? { gapThresholdMinutes, lossGapFcnt, lossGapTime, maxGapMinutes } : {}),
      // frequency stats
      ...freqStats,
      // gateway stats
      ...gwStats
    },
    timeline: {
      firstTime: firstTime ? firstTime.toISOString() : null,
      lastTime: lastTime ? lastTime.toISOString() : null,
      fcntSpan,
      resetCount
    },
  daily
  };
}

function computeCounters(fcntRecords) {
  if (fcntRecords.length === 0) {
    return { uniquePackets:0,totalWithDuplicates:0,duplicatePackets:0,expected:0,lost:0,lossRate:-1,resetCount:0,fcntSpan:-1,firstTime:null,lastTime:null };
  }
  // 排序按 Time（已由呼叫端排序，但防禦）
  fcntRecords.sort((a,b)=>a.Time - b.Time);
  const firstTime = fcntRecords[0].Time;
  const lastTime = fcntRecords[fcntRecords.length-1].Time;
  const firstFcnt = fcntRecords[0].Fcnt;
  const lastFcnt = fcntRecords[fcntRecords.length-1].Fcnt;
  const fcntSpan = (fcntRecords.length >= 2) ? (lastFcnt - firstFcnt) : -1;

  // duplicates & segments
  const fcntMap = new Map();
  let resetCount = 0;
  let segmentStart = fcntRecords[0].Fcnt;
  let prevFcnt = fcntRecords[0].Fcnt;
  let expected = 0; // 將在迴圈結束後加上最後 segment

  for (let i=0;i<fcntRecords.length;i++) {
    const f = fcntRecords[i].Fcnt;
    fcntMap.set(f, (fcntMap.get(f)||0)+1);
    if (i===0) continue;
    if (f < prevFcnt) { // reset
      // close previous segment
      expected += (prevFcnt - segmentStart + 1);
      segmentStart = f;
      resetCount++;
    }
    prevFcnt = f;
  }
  // close final
  expected += (prevFcnt - segmentStart + 1);

  const uniquePackets = fcntMap.size;
  const totalWithDuplicates = fcntRecords.length;
  const duplicatePackets = totalWithDuplicates - uniquePackets;
  const lostRaw = expected - uniquePackets;
  const lost = lostRaw > 0 ? lostRaw : 0;
  const lossRate = expected === 0 ? -1 : (lost / expected) * 100;
  return { uniquePackets, totalWithDuplicates, duplicatePackets, expected, lost, lossRate, resetCount, fcntSpan, firstTime, lastTime };
}

function buildNodeDaily(allRecords, gapThresholdMinutes, globalFrequencies, globalGateways) {
  // allRecords 已是該節點上行；須重新 grouping by date
  const byDate = new Map();
  for (const r of allRecords) {
    const key = toDateKey(r.Time);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }
  const result = [];
  for (const [date, recs] of byDate.entries()) {
    recs.sort((a,b)=>a.Time - b.Time);
    // Quality
    let rssiSum=0,rssiCount=0,snrSum=0,snrCount=0; const dr=new Set();
    const fcntRecords=[];
    for (const r of recs) {
      if (isValidNumber(r.RSSI)) { rssiSum+=r.RSSI; rssiCount++; }
      if (isValidNumber(r.SNR)) { snrSum+=r.SNR; snrCount++; }
      if (r.Datarate) dr.add(r.Datarate);
      if (isValidNumber(r.Fcnt)) fcntRecords.push(r);
    }
    const counters = computeCounters(fcntRecords);
  const avgRSSI = rssiCount ? rssiSum / rssiCount : null;
  const avgSNR = snrCount ? snrSum / snrCount : null;
    
    // 計算每日的 gap
    let dailyLossGapFcnt, dailyLossGapTime;
    if (gapThresholdMinutes && fcntRecords.length > 1) {
      dailyLossGapFcnt = [];
      dailyLossGapTime = [];
      const thresholdMs = gapThresholdMinutes * 60 * 1000;
      for (let i = 0; i < fcntRecords.length - 1; i++) {
        const a = fcntRecords[i];
        const b = fcntRecords[i + 1];
        const timeDiff = b.Time - a.Time;
        if (timeDiff > thresholdMs) {
          dailyLossGapFcnt.push([isValidNumber(a.Fcnt)?a.Fcnt:null, isValidNumber(b.Fcnt)?b.Fcnt:null]);
          dailyLossGapTime.push([a.Time.toISOString(), b.Time.toISOString()]);
        }
      }
    }
    
    const freqStats = computeFrequenciesForRecords(recs, globalFrequencies);
    const gwStats = computeGatewaysForRecords(recs, globalGateways);
    const dailyStat = {
      date,
      total: counters.uniquePackets,
      expected: counters.expected,
      lost: counters.lost,
      lossRate: counters.lossRate,
  avgRSSI,
  avgSNR,
      firstTime: counters.firstTime ? counters.firstTime.toISOString() : null,
      lastTime: counters.lastTime ? counters.lastTime.toISOString() : null,
      fcntSpan: counters.fcntSpan,
      duplicatePackets: counters.duplicatePackets,
      totalWithDuplicates: counters.totalWithDuplicates,
      resetCount: counters.resetCount,
      dataRatesUsed: Array.from(dr).sort()
    };
    // attach frequency stats (always include keys from globalFrequencies)
    dailyStat.frequenciesUsed = freqStats.frequenciesUsed;
    dailyStat.frequencyCounts = freqStats.frequencyCounts;
    // attach gateway stats (always include keys from globalGateways)
    dailyStat.gatewaysUsed = gwStats.gatewaysUsed;
    dailyStat.gatewayCounts = gwStats.gatewayCounts;
    
    // 只在有 gap 時添加相關欄位
    if (dailyLossGapFcnt && dailyLossGapFcnt.length > 0) {
      dailyStat.lossGapFcnt = dailyLossGapFcnt;
      dailyStat.lossGapTime = dailyLossGapTime;
    }
    
    result.push(dailyStat);
  }
  // 排序日期
  result.sort((a,b)=> a.date.localeCompare(b.date));
  return result;
}

// 依 allDates 對每個節點補齊缺失日為 100% 掉包
function fillPerNodeMissingDaily(perNode, allDates, { globalFrequencies, globalGateways, expectedBaseline, fixedExpected, minExpected }) {
  const freqTemplate = ensureFreqCountsTemplate(globalFrequencies || []);
  const gwTemplate = ensureGatewayCountsTemplate(globalGateways || []);
  for (const node of perNode) {
    // 建立已存在日期集合
    const exist = new Set(node.daily.map(d => d.date));
    // 計算該 node 的 daily expected 中位數（>0）
    const expectedSamples = node.daily.map(d => d.expected).filter(v => Number.isFinite(v) && v > 0);
    const med = median(expectedSamples);
    const baseline = expectedBaseline === 'per-node-daily-median' && Number.isFinite(med) ? Math.max(Math.floor(med), 1) : (fixedExpected || 1);
    const baselineExpected = Math.max(baseline, minExpected || 1);
    for (const day of allDates) {
      if (exist.has(day)) continue;
      const filled = {
        date: day,
        total: 0,
        expected: baselineExpected,
        lost: baselineExpected,
        lossRate: 100,
        avgRSSI: null,
        avgSNR: null,
        firstTime: null,
        lastTime: null,
        fcntSpan: -1,
        duplicatePackets: 0,
        totalWithDuplicates: 0,
        resetCount: 0,
        dataRatesUsed: [],
        // frequency stats: 全為 0
        frequenciesUsed: [],
        frequencyCounts: cloneFreqTemplate(freqTemplate),
        // gateway stats: 全為 0
        gatewaysUsed: [],
        gatewayCounts: cloneGatewayTemplate(gwTemplate),
        noData: true,
        expectedSource: (expectedBaseline === 'per-node-daily-median') ? 'baseline-median' : 'baseline-fixed',
        baselineExpected
      };
      node.daily.push(filled);
    }
    // 重新排序 daily
    node.daily.sort((a,b)=> a.date.localeCompare(b.date));
  }
}

// 以補齊後的 perNode.daily 聚合 global.daily
function aggregateGlobalDailyFromPerNode(perNode, allDates) {
  const daily = [];
  for (const day of allDates) {
    let nodesWithData = 0;
    let uniquePackets = 0;
    let totalWithDuplicates = 0;
    let expected = 0;
    let lost = 0;
    let resetCount = 0;
    let duplicatePackets = 0;
    let firstTime = null;
    let lastTime = null;
    const dataRates = new Set();
    const gateways = new Set();

    // 權重平均品質（以 totalWithDuplicates 作為權重）
    let rssiSum = 0, rssiWeight = 0;
    let snrSum = 0, snrWeight = 0;

    for (const node of perNode) {
      const d = node.daily.find(x => x.date === day);
      if (!d) continue; // 理論上不會發生
      if (!d.noData) nodesWithData += 1;
      uniquePackets += d.total || 0;
      totalWithDuplicates += d.totalWithDuplicates || 0;
      expected += d.expected || 0;
      lost += d.lost || 0;
      resetCount += d.resetCount || 0;
      duplicatePackets += d.duplicatePackets || 0;
      if (d.firstTime) {
        const ft = new Date(d.firstTime);
        if (!firstTime || ft < firstTime) firstTime = ft;
      }
      if (d.lastTime) {
        const lt = new Date(d.lastTime);
        if (!lastTime || lt > lastTime) lastTime = lt;
      }
      if (Array.isArray(d.dataRatesUsed)) d.dataRatesUsed.forEach(r => dataRates.add(r));
      if (Array.isArray(d.gatewaysUsed)) d.gatewaysUsed.forEach(g => gateways.add(g));
      if (d.avgRSSI !== null && d.avgRSSI !== undefined) { rssiSum += d.avgRSSI * (d.totalWithDuplicates || 0); rssiWeight += (d.totalWithDuplicates || 0); }
      if (d.avgSNR !== null && d.avgSNR !== undefined) { snrSum += d.avgSNR * (d.totalWithDuplicates || 0); snrWeight += (d.totalWithDuplicates || 0); }
    }

    const lossRate = expected > 0 ? (lost / expected) * 100 : -1;
    daily.push({
      date: day,
      nodes: nodesWithData,
      uniquePackets,
      totalWithDuplicates,
      expected,
      lost,
      lossRate,
      avgRSSI: rssiWeight ? rssiSum / rssiWeight : null,
      avgSNR: snrWeight ? snrSum / snrWeight : null,
      firstTime: firstTime ? firstTime.toISOString() : null,
      lastTime: lastTime ? lastTime.toISOString() : null,
      fcntSpan: -1, // 保持簡化；如需更精確可改以 upRecords 重算
      resetCount,
      duplicatePackets,
      dataRatesUsed: Array.from(dataRates).sort(),
      gatewaysUsed: Array.from(gateways).sort()
    });
  }
  return daily;
}

// =============================
// Global 統計
// =============================
function calcGlobal(upRecords) {
  const recs = upRecords.slice().sort((a,b)=>a.Time - b.Time);
  const fcntRecords = [];
  const qualityAgg = { rssiSum:0, rssiCount:0, snrSum:0, snrCount:0 };
  const dataRates = new Set();
  const nodeSet = new Set();
  for (const r of recs) {
    nodeSet.add(r.Devaddr);
    if (isValidNumber(r.RSSI)) { qualityAgg.rssiSum += r.RSSI; qualityAgg.rssiCount++; }
    if (isValidNumber(r.SNR)) { qualityAgg.snrSum += r.SNR; qualityAgg.snrCount++; }
    if (r.Datarate) dataRates.add(r.Datarate);
    if (isValidNumber(r.Fcnt)) fcntRecords.push(r);
  }
  const counters = computeCounters(fcntRecords);

  // Daily：將所有上行依日期拆分後，針對每日期重跑 global-like 計算
  const byDate = new Map();
  for (const r of recs) {
    const key = toDateKey(r.Time);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }
  const daily = [];
  for (const [date, dayRecords] of byDate.entries()) {
    dayRecords.sort((a,b)=>a.Time - b.Time);
    const dayNodes = new Set();
    const dayFcntRecords = [];
    let rssiSum=0,rssiCount=0,snrSum=0,snrCount=0; const dayDR=new Set();
    for (const r of dayRecords) {
      dayNodes.add(r.Devaddr);
      if (isValidNumber(r.RSSI)) { rssiSum+=r.RSSI; rssiCount++; }
      if (isValidNumber(r.SNR)) { snrSum+=r.SNR; snrCount++; }
      if (r.Datarate) dayDR.add(r.Datarate);
      if (isValidNumber(r.Fcnt)) dayFcntRecords.push(r);
    }
    const c = computeCounters(dayFcntRecords);
    const dayGwStats = computeGatewaysForRecords(dayRecords, []); // 使用空陣列，因為我們只需要當日的 gatewaysUsed
    daily.push({
      date,
      nodes: dayNodes.size,
      uniquePackets: c.uniquePackets,
      totalWithDuplicates: c.totalWithDuplicates,
      expected: c.expected,
      lost: c.lost,
      lossRate: c.lossRate,
      avgRSSI: rssiCount ? rssiSum/rssiCount : null,
      avgSNR: snrCount ? snrSum/snrCount : null,
      firstTime: c.firstTime ? c.firstTime.toISOString() : null,
      lastTime: c.lastTime ? c.lastTime.toISOString() : null,
      fcntSpan: c.fcntSpan,
      resetCount: c.resetCount,
      duplicatePackets: c.duplicatePackets,
      dataRatesUsed: Array.from(dayDR).sort(),
      gatewaysUsed: dayGwStats.gatewaysUsed
    });
  }
  daily.sort((a,b)=> a.date.localeCompare(b.date));

  const total = {
    nodes: nodeSet.size,
    uniquePackets: counters.uniquePackets,
    totalWithDuplicates: counters.totalWithDuplicates,
    expected: counters.expected,
    lost: counters.lost,
    lossRate: counters.lossRate,
    avgRSSI: qualityAgg.rssiCount ? qualityAgg.rssiSum / qualityAgg.rssiCount : null,
    avgSNR: qualityAgg.snrCount ? qualityAgg.snrSum / qualityAgg.snrCount : null,
    firstTime: counters.firstTime ? counters.firstTime.toISOString() : null,
    lastTime: counters.lastTime ? counters.lastTime.toISOString() : null,
    fcntSpan: counters.fcntSpan,
    resetCount: counters.resetCount,
    duplicatePackets: counters.duplicatePackets,
    dataRatesUsed: Array.from(dataRates).sort()
  };
  return { total, daily };
}

// =============================
// Rule-based Classification → ThresholdView
// =============================
function buildThresholdView(perNode, classification, { upRecords = [], gapThresholdMinutes, endBoundary } = {}) {
  // 建立 lookup: per node daily metrics
  const dateNodeMap = new Map(); // date -> array of { nodeId, metrics }
  // 計算整體最後時間（作為 Inactive Since 的基準）
  let overallLastTime = null;
  // 優先使用使用者設定的 End Date（若有）
  if (endBoundary) {
    overallLastTime = new Date(endBoundary);
  } else if (upRecords && upRecords.length) {
    // 否則使用資料中的最大時間
    for (const r of upRecords) {
      const t = new Date(r.Time);
      if (!overallLastTime || t > overallLastTime) overallLastTime = t;
    }
  }
  
  // 先建立 devAddr -> records 的對應
  const nodeRecordsMap = new Map();
  for (const record of upRecords) {
    const devAddr = record.Devaddr;
    if (!nodeRecordsMap.has(devAddr)) {
      nodeRecordsMap.set(devAddr, []);
    }
    nodeRecordsMap.get(devAddr).push(record);
  }
  
  for (const node of perNode) {
    const nodeRecords = nodeRecordsMap.get(node.id.devAddr) || [];
    
    for (const day of node.daily) {
      if (!dateNodeMap.has(day.date)) dateNodeMap.set(day.date, []);
      
      // 計算該日期的最大 gap（如果有啟用 gap detection）
      let dailyMaxGapMinutes = -1;
      if (gapThresholdMinutes && nodeRecords.length > 1) {
        const gapThresholdMs = gapThresholdMinutes * 60000; // 轉換為毫秒用於計算
        // 取得該節點在此日期的所有記錄，計算當日最大間隔
        const dayRecords = nodeRecords.filter(r => {
          const recordDate = new Date(r.Time).toISOString().split('T')[0];
          return recordDate === day.date;
        });
        
        if (dayRecords.length > 1) {
          dayRecords.sort((a, b) => new Date(a.Time) - new Date(b.Time));
          for (let i = 0; i < dayRecords.length - 1; i++) {
            const diffMs = new Date(dayRecords[i + 1].Time) - new Date(dayRecords[i].Time);
            const diffMinutes = diffMs / 60000; // 轉換為分鐘
            if (diffMinutes > dailyMaxGapMinutes) dailyMaxGapMinutes = diffMinutes;
          }
        }
      }

      // 構建當日 metrics 並計算每日的例外命中（只考慮 resetCount 與 gap；不套用 inactiveSince 至 daily）
      const metrics = {
        lossRate: day.lossRate,
        resetCount: day.resetCount,
        avgRSSI: day.avgRSSI,
        avgSNR: day.avgSNR,
        duplicatePackets: day.duplicatePackets,
        maxGapMinutes: dailyMaxGapMinutes
      };
      try {
        const dailyMatches = getExceptionMatches(metrics, classification);
        const labelMap = { resetCount: 'FCNT Reset', maxGapMinutes: 'No Data Gap', inactiveSinceMinutes: 'Inactive Since' };
        const tags = Array.from(new Set(dailyMatches.map(m => m.metric)));
        const labels = tags.map(t => labelMap[t] || String(t));
        const noteMap = dailyMatches.reduce((acc, m) => {
          if (!m.note) return acc;
          (acc[m.metric] ||= []).push(m.note);
          return acc;
        }, {});
        // 將每日例外資訊附加至原 day 物件，供 UI 於每日模式使用
        if (labels.length) {
          day.exceptionTags = tags;
          day.exceptionLabels = labels;
          if (Object.keys(noteMap).length) day.exceptionNoteMap = noteMap;
        } else {
          // 若無每日例外，確保為空以利前端判斷
          day.exceptionTags = [];
          day.exceptionLabels = [];
          delete day.exceptionNoteMap;
        }
      } catch (e) {
        // 忽略每日例外計算錯誤
      }

      dateNodeMap.get(day.date).push({ node, day, metrics });
    }
  }
  
  // 計算每日分類
  const list = [];
  for (const [date, arr] of dateNodeMap.entries()) {
    const normal=[], abnormal=[], exception=[];
    for (const item of arr) {
      const category = classifyMetrics(item.metrics, classification);
      const name = item.node.id.devName || item.node.id.devAddr;
      
      // Debug: 記錄每日 gap 相關的分類資訊
      if (gapThresholdMinutes && item.metrics.maxGapMinutes > -1) {
        console.log(`[Analytics] Node ${name} daily gap on ${date}: ${item.metrics.maxGapMinutes} min, category: ${category}`);
      }
      
      if (category === 'normal') normal.push(name);
      else if (category === 'exception') exception.push(name);
      else abnormal.push(name);
    }
    list.push({ date, normalcnt: normal.length, abnormalcnt: abnormal.length, exceptioncnt: exception.length, normal: normal.sort(), abnormal: abnormal.sort(), exception: exception.sort() });
  }
  list.sort((a,b)=> a.date.localeCompare(b.date));

  // 計算總體分類（基於每個節點的整體統計）
  const totalNormal=[], totalAbnormal=[], totalException=[];
  for (const node of perNode) {
    // 使用節點的整體統計來分類
    const totalMetrics = {
      lossRate: node.total.lossRate,
      resetCount: node.total.resetCount,
      avgRSSI: node.total.avgRSSI,
      avgSNR: node.total.avgSNR,
      duplicatePackets: node.total.duplicatePackets,
      maxGapMinutes: node.total.maxGapMinutes || -1, // Gap detection 結果（分鐘）
      // Inactive Since（分鐘）：節點最後上傳至整體最後時間
      inactiveSinceMinutes: (() => {
        try {
          if (!overallLastTime) return undefined;
          const nodeLastIso = node.timeline?.lastTime;
          if (!nodeLastIso) return undefined;
          const nodeLast = new Date(nodeLastIso);
          const diff = (overallLastTime - nodeLast) / 60000;
          return Number.isFinite(diff) ? Math.max(0, diff) : undefined;
        } catch (e) { return undefined; }
      })()
    };
    const category = classifyMetrics(totalMetrics, classification);

    // 計算所有命中的 Exception 類型，並存到節點上供 UI 顯示
    try {
      const exceptionMatches = getExceptionMatches(totalMetrics, classification);
      // 以 metric 名稱作為 tags
      const exceptionTags = Array.from(new Set(exceptionMatches.map(m => m.metric)));
      // 轉換為可讀標籤
      const labelMap = {
        resetCount: 'FCNT Reset',
        maxGapMinutes: 'No Data Gap',
        inactiveSinceMinutes: 'Inactive Since'
      };
      const exceptionLabels = exceptionTags.map(t => labelMap[t] || String(t));
      // 可選：附上說明（來自 rule.note）
      const exceptionNotes = exceptionMatches.map(m => m.note).filter(Boolean);
      // 依 metric 聚合 notes 以便 tooltip 顯示
      const exceptionNoteMap = exceptionMatches.reduce((acc, m) => {
        if (!m.note) return acc;
        if (!acc[m.metric]) acc[m.metric] = [];
        acc[m.metric].push(m.note);
        return acc;
      }, {});
      // 將結果掛到 node.total，以便前端表格取用
      if (node && node.total) {
        node.total.exceptionTags = exceptionTags;
        node.total.exceptionLabels = exceptionLabels;
        if (exceptionNotes.length) node.total.exceptionNotes = exceptionNotes;
        if (Object.keys(exceptionNoteMap).length) node.total.exceptionNoteMap = exceptionNoteMap;
      }
    } catch (e) {
      // 安全防護：即便失敗也不影響原有分類流程
      // console.warn('[Analytics] getExceptionMatches failed:', e);
    }
    const name = node.id.devName || node.id.devAddr;
    
    // Debug: 記錄 gap 相關的分類資訊
    if (gapThresholdMinutes && node.total.maxGapMinutes > -1) {
      console.log(`[Analytics] Node ${name} total gap: ${node.total.maxGapMinutes} min, category: ${category}`);
    }
    
    if (category === 'normal') totalNormal.push(name);
    else if (category === 'exception') totalException.push(name);
    else totalAbnormal.push(name);
  }

  const total = {
    normalcnt: totalNormal.length,
    abnormalcnt: totalAbnormal.length,
    exceptioncnt: totalException.length,
    normal: totalNormal.sort(),
    abnormal: totalAbnormal.sort(),
    exception: totalException.sort()
  };

  const { thresholdValue, exceptionResetThreshold, exceptionRule } = extractThresholdHints(classification);
  return { total, list, thresholdValue, exceptionResetThreshold, exceptionRule };
}

function classifyMetrics(metrics, classification) {
  for (const rule of classification.rules) {
    if (ruleMatch(metrics, rule)) return rule.category;
  }
  return classification.defaultCategory;
}

function ruleMatch(metrics, rule) {
  const v = metrics[rule.metric];
  
  // 特殊處理 maxGapMinutes：-1 表示不適用
  if (rule.metric === 'maxGapMinutes' && v < 0) {
    return false; // 沒有 gap 資料時，不符合條件
  }
  
  if (v === undefined || v === null || Number.isNaN(v)) return false;
  switch (rule.op) {
    case '>': return v > rule.value;
    case '>=': return v >= rule.value;
    case '<': return v < rule.value;
    case '<=': return v <= rule.value;
    case 'between': return v >= rule.min && v <= rule.max;
    case 'outside': return v < rule.min || v > rule.max;
    default: return false;
  }
}

function extractThresholdHints(classification) {
  let thresholdValue, exceptionResetThreshold, exceptionRule;
  for (const r of classification.rules) {
    if (thresholdValue === undefined && r.metric === 'lossRate' && (r.op === '>' || r.op === '>=')) {
      thresholdValue = r.value;
    }
    if (exceptionResetThreshold === undefined && r.metric === 'resetCount' && r.category === 'exception' && (r.op === '>' || r.op === '>=')) {
      exceptionResetThreshold = r.value;
      exceptionRule = r.note || `resetCount ${r.op} ${r.value}`;
    }
  }
  return { thresholdValue, exceptionResetThreshold, exceptionRule };
}

// 列舉所有命中的 Exception 規則（用於顯示多例外類型）
function getExceptionMatches(metrics, classification) {
  const matches = [];
  if (!classification || !Array.isArray(classification.rules)) return matches;
  for (const rule of classification.rules) {
    // 只收集 priority=1 或標記為 exception 的規則
    const isExceptionRule = rule.priority === 1 || rule.category === 'exception';
    if (!isExceptionRule) continue;
    const v = metrics[rule.metric];
    if (rule.metric === 'maxGapMinutes' && (v === undefined || v === null || v < 0)) continue; // 不適用
    if (v === undefined || v === null || Number.isNaN(v)) continue;
    if (ruleMatch(metrics, rule)) {
      matches.push({ metric: rule.metric, op: rule.op, value: rule.value, note: rule.note });
    }
  }
  return matches;
}

// =============================
// Meta & TimeRange
// =============================
function calcTimeRange(records) {
  if (!records.length) return { start: null, end: null, days: 0 };
  let min = records[0].Time, max = records[0].Time;
  for (const r of records) {
    if (r.Time < min) min = r.Time;
    if (r.Time > max) max = r.Time;
  }
  const startKey = toDateKey(min);
  const endKey = toDateKey(max);
  const days = dateDiffDays(startKey, endKey) + 1; // inclusive
  return { start: min.toISOString(), end: max.toISOString(), days };
}

function dateDiffDays(d1, d2) { // YYYY-MM-DD
  const t1 = Date.parse(d1 + 'T00:00:00Z');
  const t2 = Date.parse(d2 + 'T00:00:00Z');
  return Math.floor((t2 - t1)/(86400000));
}

function buildMeta({ version, excludedCount, filterWindow, timeRange, classification }) {
  return {
    generatedAt: new Date().toISOString(),
    version,
    includeDownlinkInQuality: false,
    lossRateScope: 'uplink-only',
    resetRule: 'any-decrease',
    classification,
  dailyFill: normalizeDailyFill(),
    filterWindow: {
      start: filterWindow.start ? filterWindow.start.toISOString() : null,
      end: filterWindow.end ? filterWindow.end.toISOString() : null,
      inclusiveStart: filterWindow.inclusiveStart,
      inclusiveEnd: filterWindow.inclusiveEnd,
      excluded: excludedCount
    },
    timeRange
  };
}

// =============================
// (可選) 簡易全域匯出至 window 方便瀏覽器測試
// =============================
if (typeof window !== 'undefined') {
  window.buildAnalytics = buildAnalytics;
}
