/*
 * Data Processor v2.1 (RawRecord Parser Only)
 * 
 * 本版本依照 doc/Analysis.md 最新規格，僅負責「CSV -> 標準化 RawRecord[]」的轉換。
 * 不覆蓋舊版 data-processor.js；後續統計 (analytics) / classification 可在此基礎擴充。
 * 
 * 主要特點：
 * - 新欄位映射：Received -> Time, Device Name -> Devname, Type 解析為 FrameType, ... 等。
 * - 嚴格過濾：缺 Devname 或 Devaddr 之列捨棄。
 * - 日期解析：期望格式 YYYY-MM-DD HH:mm:ss；失敗 fallback new Date()。
 * - FrameType 拆解：Confirmed_Up / Unconfirmed_Down 轉 { isUp, confirmed }。
 * - MAC 欄位多行以 \n 切割成陣列，移除空白行。
 * - RSSI / SNR 空字串不參與品質平均，這裡保留為 NaN 以利後續判斷 (Number.isNaN)。
 * - ACK 直接 boolean 化 ("true"/"false" 不分大小寫)。
 * - 所有欄位名稱大小寫與文件 RawRecord 型別一致；Time 為 Date 物件。
 * - 提供 parseCSVRaw 主函式 + 低階 parseCSVRows (處理引號) + 轉換器。
 * 
 * 後續擴充建議：
 * 1. 在同檔新增 buildAnalytics(records, options) 生成 analytics 容器。
 * 2. 加入增量模式：parse 新片段後合併去重。
 * 3. 支援 streaming（逐行解析 callback）。
 */

/**
 * @typedef {Object} RawRecord
 * @property {Date} Time
 * @property {string} Devname
 * @property {string} Devaddr
 * @property {number} Fcnt
 * @property {number} Freq
 * @property {number} RSSI
 * @property {number} SNR
 * @property {number} Port
 * @property {{isUp: boolean; confirmed: boolean}=} FrameType
 * @property {boolean=} ACK
 * @property {string=} Datarate
 * @property {string[]=} Mac
 * @property {string=} MacCommand
 * @property {string=} Data
 */

// =============================
// Header 映射設定
// =============================
const HEADER_MAP = {
  'Received': 'Time',
  'Device Name': 'Devname',
  'Type': 'Type',          // 特殊：解析為 FrameType
  'DevAddr': 'Devaddr',
  'MAC': 'Mac',
  'U/L RSSI': 'RSSI',
  'U/L SNR': 'SNR',
  'FCnt': 'Fcnt',
  'Datarate': 'Datarate',
  'ACK': 'ACK',
  'Port': 'Port',
  'Frequency': 'Freq',
  'MAC Command': 'MacCommand',
  'Data': 'Data'
};

// 可接受的標題別名 (大小寫不敏感)
const HEADER_ALIASES = {
  'time': 'Received',
  'device name': 'Device Name',
  'devaddr': 'DevAddr',
  'fcnt': 'FCnt',
  'freq': 'Frequency',
  'mac command': 'MAC Command',
  'rssi': 'U/L RSSI',
  'snr': 'U/L SNR'
};

/**
 * 將原始標題標準化回主標題
 * @param {string} raw
 * @returns {string}
 */
function normalizeHeader(raw) {
  if (!raw) return raw;
  const key = raw.trim();
  const lower = key.toLowerCase();
  if (HEADER_ALIASES[lower]) return HEADER_ALIASES[lower];
  return key; // 如 'Received' 等已是正式標題
}

/**
 * 進階 CSV 解析：支援引號包裹、引號內逗號和換行符
 * @param {string} csvText
 * @returns {string[][]}
 */
function parseCSVRows(csvText) {
  // 標準化換行符，保留原始換行符用於正確的多行欄位處理
  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  const chars = text.split('');
  let current = '';
  let currentRow = [];
  let inQuotes = false;
  
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const nextCh = chars[i + 1];
    
    if (ch === '"') {
      // 處理雙引號 escape: "" -> "
      if (inQuotes && nextCh === '"') {
        current += '"';
        i++; // 跳過下一個引號
      } else {
        // 切換引號狀態
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      // 不在引號內的逗號作為欄位分隔符
      currentRow.push(current.trim());
      current = '';
    } else if (ch === '\n' && !inQuotes) {
      // 不在引號內的換行符作為行分隔符
      currentRow.push(current.trim());
      if (currentRow.some(col => col.length > 0)) { // 只加入非空行
        rows.push(currentRow);
      }
      currentRow = [];
      current = '';
    } else {
      // 普通字符（包括引號內的換行符）
      current += ch;
    }
  }
  
  // 處理最後一個欄位和行
  if (current.length > 0 || currentRow.length > 0) {
    currentRow.push(current.trim());
    if (currentRow.some(col => col.length > 0)) {
      rows.push(currentRow);
    }
  }
  
  return rows;
}

/**
 * 解析 Type 欄位 => { isUp, confirmed }
 * Type 格式範例：Confirmed_Up, Unconfirmed_Down
 * @param {string} raw
 */
function parseFrameType(raw) {
  if (!raw) return undefined;
  const parts = raw.split('_');
  if (parts.length !== 2) return undefined;
  const [confPart, dirPart] = parts;
  const confirmed = /^confirmed$/i.test(confPart);
  const isUp = /_?Up$/i.test(raw) || /^Up$/i.test(dirPart);
  const isDown = /Down$/i.test(dirPart);
  if (!isUp && !isDown) return undefined;
  return { isUp, confirmed };
}

/**
 * 解析時間：期望 YYYY-MM-DD HH:mm:ss；若有 'T' 形式亦接受；失敗 fallback new Date()
 * 視為 UTC：將空白替換為 'T' 並加 'Z'
 * @param {string} raw
 * @returns {Date}
 */
// ===== 時區工具 =====
function pad2(n){return n<10?'0'+n:''+n;}
function formatIsoLocal(y,M,d,h,m,s){return `${y}-${pad2(M)}-${pad2(d)}T${pad2(h)}:${pad2(m)}:${pad2(s)}:00`;}

/**
 * 將「沒有時區資訊的字串時間」(naive) 視為指定 IANA 時區的地方時間，轉為對應的 UTC Date 物件。
 * 參考演算法：建立 UTC 猜測值，反覆修正至 formatToParts() 於該時區輸出之年月日時分秒與目標一致。
 * @param {number} Y
 * @param {number} M 1-12
 * @param {number} D
 * @param {number} h
 * @param {number} m
 * @param {number} s
 * @param {string} tz IANA timezone
 */
function naivePartsToDateInTZ(Y,M,D,h,m,s,tz){
  // 初始猜測：假設此一組時間就是 UTC
  let guess = new Date(Date.UTC(Y,M-1,D,h,m,s,0));
  try {
    const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    for (let i=0;i<5;i++) { // 最多修正 5 次 (DST 邊界通常 2 次內收斂)
      const parts = fmt.formatToParts(guess).reduce((acc,p)=>{acc[p.type]=p.value;return acc;},{});
      const curY = Number(parts.year), curM=Number(parts.month), curD=Number(parts.day), curH=Number(parts.hour), curMin=Number(parts.minute), curS=Number(parts.second);
      if (curY===Y && curM===M && curD===D && curH===h && curMin===m && curS===s) break; // 已匹配
      // 將「目前時區表示」與「目標本地時間」轉為 minutes 比較差異
      const targetMinutes = Date.UTC(Y,M-1,D,h,m,s)/60000;
      const currentMinutes = Date.UTC(curY,curM-1,curD,curH,curMin,curS)/60000;
      const diffMin = targetMinutes - currentMinutes;
      if (!diffMin) break;
      guess = new Date(guess.getTime() + diffMin*60000);
    }
  } catch(e) { /* 若不支援該時區，保留 guess */ }
  return guess;
}

/**
 * 專用解析時間：
 * - 若提供 options.timezone 則將字串按該時區解讀；否則維持原本 (本地系統) 解析。
 * - 支援格式：YYYY-MM-DD HH:mm:ss (naive)、或任何 Date 可解析字串。
 * @param {string} raw
 * @param {string} [timezone]
 */
function parseTime(raw, timezone) {
  if (!raw) return new Date();
  const t = raw.trim();
  const naiveMatch = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t);
  if (naiveMatch) {
    const [datePart, timePart] = t.split(' ');
    const [Y, M, D] = datePart.split('-').map(Number);
    const [h, m, s] = timePart.split(':').map(Number);
    if (timezone) {
      return naivePartsToDateInTZ(Y,M,D,h,m,s,timezone);
    }
    // 無指定時區 → 以系統本地時間建 Date
    return new Date(Y, M - 1, D, h, m, s);
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * 將欄位字串轉 number；空字串或不合法回傳 null（方便 JSON 與前端處理）；
 * 若要進行數值運算請先以 Number.isFinite(...) 判斷。
 * @param {string} raw
 */
function parseNumberOrNaN(raw) {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

/**
 * 將欄位字串轉整數，失敗回 NaN
 */
function parseIntOrNaN(raw) {
  if (raw === undefined || raw === null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

/**
 * Boolean parsing for ACK
 * @param {string} raw
 * @returns {boolean|undefined}
 */
function parseBoolean(raw) {
  if (raw === undefined || raw === null) return undefined;
  const t = raw.trim().toLowerCase();
  if (t === 'true' || t === '1') return true;
  if (t === 'false' || t === '0') return false;
  return undefined;
}

/**
 * MAC 欄位：多行以 \n 或 ; 分隔
 * @param {string} raw
 * @returns {string[]|undefined}
 */
function parseMacList(raw) {
  if (!raw) return undefined;
  const parts = raw.split(/\n|;|,/).map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

/**
 * 將一列原始欄位物件轉為 RawRecord；若缺 Devname/Devaddr 回傳 null 以便過濾。
 * @param {Object} rowObj - key 已標準化
 * @returns {RawRecord|null}
 */
function transformRow(rowObj, timezone) {
  // helper to try multiple possible keys in priority order
  function getField(obj, ...keys) {
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
    return undefined;
  }

  const devName = getField(rowObj, 'Devname', 'Device Name', 'DevName');
  const devAddr = getField(rowObj, 'Devaddr', 'DevAddr');
  if (!devName || !devAddr) return null;

  const frameType = parseFrameType(getField(rowObj, 'Type'));
  const rssi = parseNumberOrNaN(getField(rowObj, 'RSSI', 'U/L RSSI'));
  const snr = parseNumberOrNaN(getField(rowObj, 'SNR', 'U/L SNR'));

  /** @type {RawRecord} */
  const rec = {
  Time: parseTime(getField(rowObj, 'Time', 'Received'), timezone),
    Devname: devName,
    Devaddr: devAddr,
    Fcnt: parseIntOrNaN(getField(rowObj, 'Fcnt', 'FCnt')),
    Freq: parseNumberOrNaN(getField(rowObj, 'Freq', 'Frequency')),
    RSSI: rssi,
    SNR: snr,
    Port: parseIntOrNaN(getField(rowObj, 'Port')),
    FrameType: frameType,
    ACK: parseBoolean(getField(rowObj, 'ACK')),
    Datarate: getField(rowObj, 'Datarate') || undefined,
    Mac: parseMacList(getField(rowObj, 'Mac', 'MAC')),
    MacCommand: getField(rowObj, 'MacCommand', 'MAC Command', 'Mac Command') || undefined,
    Data: getField(rowObj, 'Data') || undefined
  };

  return rec;
}


/**
 * 主函式：解析 CSV -> RawRecord[]
 * @param {string} csvText
 * @param {{onRowError?:(line:number,msg:string)=>void}} [opts]
 * @returns {RawRecord[]}
 */
function parseCSVRaw(csvText, opts = {}) {
  const timezone = opts.timezone; // IANA timezone from UI (例如 'Asia/Taipei')
  const rows = parseCSVRows(csvText);
  if (rows.length === 0) return [];

  // 標題列標準化
  const rawHeaders = rows[0].map(h => normalizeHeader(h));
  const mappedHeaders = rawHeaders.map(h => HEADER_MAP[h] ? HEADER_MAP[h] : h); // e.g. Received->Time

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i];
    const rowObj = {};
    for (let c = 0; c < mappedHeaders.length; c++) {
      // use mappedHeaders as canonical key (e.g. Time, Devname, Devaddr)
      const headerKey = mappedHeaders[c] || rawHeaders[c];
      rowObj[headerKey] = line[c];
    }
    try {
  const rec = transformRow(rowObj, timezone);
      if (rec) records.push(rec);
      else if (opts.onRowError) opts.onRowError(i + 1, 'Missing required Devname or Devaddr');
    } catch (err) {
      if (opts.onRowError) opts.onRowError(i + 1, (err && err.message) || 'Unknown row error');
    }
  }
  console.log("Raw Records:", records);
  return records;
}


// 若在非模組環境（老舊瀏覽器）可掛到 window 方便測試
if (typeof window !== 'undefined') {
  window.parseCSVRaw = parseCSVRaw;
}
