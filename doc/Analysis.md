# 資料格式與統計分析規格（方案 B：重構後最終版）

更新日期：2025-09-24（同步目前程式實作：時區切日、頻率/網關基準、duplicateRate/gap 欄位等）

新增：
- FCnt Reset 例外分類 `exception` 規格（第三分類）與「規則式 (rule-based) 多指標分類」。
- 支援以 IANA 時區切日與 gap 偵測（含日界線）。
- 頻率與網關的全域基準集合，提供 node total/daily 的 counts 與 used 清單。
- duplicateRate 與 maxGapMinutes 欄位。

本文目標：
1. 定義新 CSV 欄位對內部標準欄位的映射與轉型規則。
2. 描述標準化後 `RawRecord` 結構（含 FrameType/ACK）。
3. 定義重構後統計核心架構（最終版）：`analytics.perNode` / `analytics.global` / `analytics.threshold` / `analytics.meta`。
4. 提供完整 TypeScript 介面（無過渡欄位）。
5. 說明主要指標與流程（Pseudo Steps）。
6. 範例輸出 JSON（含 rule-based classification 與 GAP 範例）。
7. 邊界情境與後續擴充建議。

> 舊版的 `organizedRecords.*` 架構已淘汰，僅保留本文件最終版 `analytics` 定義；不再提供任何過渡 (legacy) 欄位。

---

## 1. 新 CSV 欄位映射與轉型

| CSV 原始欄位 | 範例值 | 內部欄位 | 轉型 / 說明 |
|---------------|--------|----------|-------------|
| Received | 2025-08-19 11:04:26 | Time | 轉 `Date` (`YYYY-MM-DD HH:mm:ss`)；若 UI 以 `options.timezone` 指定 IANA 時區，則以該時區之「地方時間」解讀並轉為 UTC；失敗 fallback `new Date()` |
| Device Name | WISE-2410-VibTest | Devname | 必填字串，缺失捨棄 |
| Type | Confirmed_Up | FrameType | 拆為 `{ isUp: boolean; confirmed: boolean }` (`_Up/_Down` + `Confirmed/Unconfirmed`) |
| DevAddr | FFB1FA66 | Devaddr | 必填字串，缺失捨棄 |
| MAC | 0016C001F1DE40D9(換行...) | Mac | 多值以 `\n`、`;` 或 `,` 分隔皆可，解析為 `string[]` |
| U/L RSSI | -91 | RSSI | `number`；空字串或不可解析 → `null`；品質平均時僅統計有效值 |
| U/L SNR | 7.2 | SNR | 同上 |
| FCnt | 18302 | Fcnt | `number`；不可解析 → `null` |
| Datarate | SF7BW125 | Datarate | 原字串保留 |
| ACK | true / false | ACK | `boolean` (LoRaWAN ACK bit，非 confirmed flag) |
| Port | 1 | Port | `number`；不可解析 → `null` |
| Frequency | 923.4 | Freq | `number`；不可解析 → `null` |
| MAC Command | 069306 | MacCommand | 字串，可空 |
| Data | 817E3A... | Data | Hex Payload |

新增邏輯欄位：
| 欄位 | 來源/規則 |
|------|-----------|
| FrameType.isUp | `Type` 含 `_Up` => true；含 `_Down` => false |
| FrameType.confirmed | `Type` 以 `Confirmed` 開頭 => true；否則 false |
| ACK | 直接對應 CSV 欄位 |

過濾規則：`Devname` 或 `Devaddr` 缺失剔除；時間解析失敗 fallback；其餘欄位空值不強制填補。

注意：數值欄位（如 `Fcnt/Freq/RSSI/SNR/Port`）若空值或格式無效，會以 `null` 儲存，後續統計須以 `Number.isFinite(...)` 判斷是否納入計算。

---

## 2. RawRecord 標準結構

```jsonc
{
	"Time": "2025-08-19T03:04:26.000Z",
	"Devname": "WISE-2410-VibTest",
	"Devaddr": "FFB1FA66",
	"Fcnt": 18302,
	"Freq": 923.4,
	"RSSI": -91,
	"SNR": 7.2,
	"Port": 1,
	"FrameType": { "isUp": true, "confirmed": true },
	"ACK": false,
	"Datarate": "SF7BW125",
	"Mac": ["0016C001F1DE40D9"],
	"MacCommand": "",
	"Data": "817E3A50...A3686D"
}
```

> 遺失率與品質計算預設僅使用上行 (`FrameType.isUp === true`) 記錄。

型別備註（實作一致）：

```ts
export type RawRecord = {
  Time: Date;
  Devname: string;
  Devaddr: string;
  Fcnt: number | null;
  Freq: number | null;
  RSSI: number | null;
  SNR: number | null;
  Port: number | null;
  FrameType?: { isUp: boolean; confirmed: boolean };
  ACK?: boolean;
  Datarate?: string;
  Mac?: string[];
  MacCommand?: string;
  Data?: string;
}
```

---

## 3. 重構後統計架構（方案 B）

核心容器：
```ts
interface AnalyticsContainer {
	perNode: NodeStat[];      // 每節點完整統計
	global: GlobalStat;       // 全域彙總 + 每日
	threshold: ThresholdView; // 閾值分類視圖
	meta: AnalyticsMeta;      // 版本 / 參數 / 執行資訊
}
```

### 3.1 perNode
每節點分群：`NodeStat`，聚合統計 + 每日拆分 `daily`。

### 3.2 global
全域層級雙層：`total`（整段期間）+ `daily`（按日匯總）。

### 3.3 threshold
保存遺失率與例外分類視圖（原 `LW_Statistics`），現在基於「規則式分類結果」派生。僅輸出三大主類：

* normal：未命中 higher-priority 規則（或所有規則）時的 `defaultCategory`。
* abnormal：命中 lossRate 超過規則的類別（典型為 `lossRate > threshold`）。
* exception：命中 FCnt Reset、Inactive Since 等高優先級規則（由 rules 決定；No Data Gap 已移至 Advanced Analysis）。

說明：
* 真正的分類邏輯集中在 `meta.classification.rules`。
* 不支援 tags；第一個命中規則即為結果；未命中則 defaultCategory。
* 若未來增加更多類別（如 `weak-signal`, `noisy`），可自行決定是否將其視為 abnormal 或保留在外（目前視圖仍只渲染三類）。

實作補充（可選輸出，供前端顯示）：
* 在每個節點 `total` 與 `daily`，若命中任一 exception 規則，會附加 `exceptionTags`、`exceptionLabels` 與（若有）`exceptionNoteMap` 以便 UI 呈現。

### 3.4 meta
執行參數（版本、重置規則、是否包含下行、資料時間範圍、時區）。

### 3.5 Advanced Analysis（新）
此區為額外分析指標，不影響 exception 分類結果。

目前包含：
* No Data Gap：透過 `gapThresholdMinutes` 偵測相鄰上行紀錄（含分析視窗邊界與日界線）時間差是否 >= 閾值，輸出：
  - `lossGapFcnt` / `lossGapTime`
  - `maxGapMinutes`
* 這些欄位僅作為診斷與視覺化用途，不再自動加入 classification.rules 的 exception 規則。
* UI 上從「Exception」移至「Advanced Analysis」區塊，且不顯示原先 GAP 徽章。

----

## 4. TypeScript 型別（最終）

```ts
// 4.1 原始記錄
export type RawRecord = {
  Time: Date;
  Devname: string;
  Devaddr: string;
  Fcnt: number | null;
  Freq: number | null;
  RSSI: number | null;
  SNR: number | null;
  Port: number | null;
  FrameType?: { isUp: boolean; confirmed: boolean };
  ACK?: boolean;
  Datarate?: string;
  Mac?: string[];
  MacCommand?: string;
  Data?: string;
};

// 4.2 節點每日統計
export type NodeDailyStat = {
  date: string;                // YYYY-MM-DD（以 UI 指定 IANA 時區切分；未指定則使用系統本地時區）
  total: number;               // unique 上行
  expected: number;            // segment expected sum
  lost: number;                // expected - total
  lossRate: number;            // %（expected=0 → -1）
  avgRSSI: number | null;
  avgSNR: number | null;
  firstTime: string | null;    // ISO
  lastTime: string | null;     // ISO
  fcntSpan: number;            // lastFcnt - firstFcnt + 1 (同日)；不足兩筆 → -1
  duplicatePackets: number;    // totalWithDuplicates - total
  totalWithDuplicates: number; // 上行紀錄含重複
  duplicateRate?: number;      // (%)；分母=totalWithDuplicates；分母=0 → -1
  // 補齊資訊
  noData?: boolean;
  expectedSource?: 'fcnt' | 'baseline-fixed' | 'baseline-median' | 'interpolated';
  baselineExpected?: number;
  // 網關與頻率
  frequenciesUsed?: number[];
  frequencyCounts?: Record<string, number>;
  gatewaysUsed?: string[];
  gatewayCounts?: Record<string, number>;
  // gap
  lossGapFcnt?: Array<[number|null, number|null]>;
  lossGapTime?: Array<[string|null, string|null]>;
  maxGapMinutes?: number;      // 無 gap → -1
  // 例外（每日）
  exceptionTags?: string[];
  exceptionLabels?: string[];
  exceptionNoteMap?: Record<string, string[]>;
};

// 4.3 節點整體統計
export type NodeStat = {
  id: { devName: string; devAddr: string };
  total: {
    uniquePackets: number;
    totalWithDuplicates: number;
    expected: number;
    lost: number;
    lossRate: number;          // %（expected=0 → -1）
    duplicatePackets: number;  // totalWithDuplicates - uniquePackets
    duplicateRate?: number;    // (%)；totalWithDuplicates 為分母；分母=0 → -1
    resetCount: number;        // 同 timeline.resetCount 的鏡像欄位
    avgRSSI: number | null;    // null 代表無樣本
    avgSNR: number | null;
    dataRatesUsed: string[];
    // 頻率/網關統計（以全域基準）
    frequenciesUsed?: number[];
    frequencyCounts?: Record<string, number>;
    gatewaysUsed?: string[];
    gatewayCounts?: Record<string, number>;
    // gap
    gapThresholdMinutes?: number;
    lossGapFcnt?: Array<[number|null, number|null]>;
    lossGapTime?: Array<[string|null, string|null]>;
    maxGapMinutes?: number;    // 無 gap → -1
    // 例外（總體）
    exceptionTags?: string[];
    exceptionLabels?: string[];
    exceptionNotes?: string[];
    exceptionNoteMap?: Record<string, string[]>;
  };
  timeline: {
    firstTime: string | null;
    lastTime: string | null;
    fcntSpan: number;          // 全期間 last - first；不足兩筆 → -1
    resetCount: number;
  };
  daily: NodeDailyStat[];      // 依日排序
};

// 4.4 全域每日
export type GlobalDailyStat = {
  date: string;
  nodes: number;               // 當日有上行資料節點數
  nodesTotal: number;          // 全期間節點總數（含補齊日）
  uniquePackets: number;
  totalWithDuplicates: number;
  duplicatePackets: number;
  duplicateRate?: number;      // 分母=totalWithDuplicates；分母=0 → -1
  expected: number;
  lost: number;
  lossRate: number;            // expected=0 → -1
  avgRSSI: number | null;
  avgSNR: number | null;
  firstTime: string | null;
  lastTime: string | null;
  fcntSpan: number;            // 略（簡化為 -1 或另計）
  resetCount: number;
  dataRatesUsed: string[];
  frequenciesUsed?: number[];
  gatewaysUsed?: string[];
};

// 4.5 全域統計
export type GlobalStat = {
  total: {
    nodes: number;
    uniquePackets: number;
    totalWithDuplicates: number;
    duplicatePackets: number;
    duplicateRate?: number;
    expected: number;
    lost: number;
    lossRate: number;
    avgRSSI: number | null;
    avgSNR: number | null;
    firstTime: string | null;
    lastTime: string | null;
    fcntSpan: number;          // 可跨節點
    resetCount: number;
    dataRatesUsed: string[];
    frequenciesUsed?: number[]; // 全域基準
    gatewaysUsed?: string[];    // 全域基準
  };
  daily: GlobalDailyStat[];
};

// 4.6 閾值分類視圖
export type ThresholdView = {
  total: {
    normalcnt: number;
    abnormalcnt: number;
    exceptioncnt: number;
    normal: string[];
    abnormal: string[];
    exception: string[];
  };
  list: Array<{
    date: string;
    normalcnt: number;
    abnormalcnt: number;
    exceptioncnt: number;
    normal: string[];
    abnormal: string[];
    exception: string[];
  }>;
  byDate?: Record<string, {
    normalcnt: number;
    abnormalcnt: number;
    exceptioncnt: number;
    normal: string[];
    abnormal: string[];
    exception: string[];
  }[]>;
  thresholdValue?: number;          // 遺失率閾值 (%)
  exceptionResetThreshold?: number; // FCnt Reset 次數門檻 (>=)
  exceptionRule?: string;           // 文字化規則描述
};

// 4.7 規則式分類
export type ClassificationRule = {
  metric: string;                             // e.g. 'lossRate' | 'resetCount' | 'inactiveSinceMinutes' | 'maxGapMinutes'(Advanced only)
  op: '>' | '>=' | '<' | '<=' | 'between' | 'outside';
  value?: number;                             // 適用於 > >= < <=
  min?: number;                               // 適用於 between/outside
  max?: number;                               // 適用於 between/outside
  category: string;                           // 例：'exception' | 'abnormal' | 'normal'
  note?: string;                              // 規則說明
  priority?: number;                          // 可選：例外優先規則可設 1
};

export type ClassificationConfig = {
  version?: string;
  defaultCategory: string;
  rules: ClassificationRule[];
  metricsAlias?: Record<string,string>;
};

// 4.8 Meta
export type AnalyticsMeta = {
  generatedAt: string;        // ISO 時間
  version: string;            // e.g. '2.0.0'
  includeDownlinkInQuality: false; // 固定 false
  lossRateScope: 'uplink-only';    // 僅上行
  resetRule: 'any-decrease';       // 重置規則
  classification?: ClassificationConfig;
  timezone?: string | null;        // IANA 時區字串
  dailyFill?: {
    enabled: boolean;              // 預設 true
    mode: 'no-data-100-loss';
    expectedBaseline: 'per-node-daily-median' | 'fixed';
    fixedExpected?: number;        // 預設 1
    minExpected?: number;          // 預設 1
  };
  filterWindow: {
    start: string | null;
    end: string | null;
    inclusiveStart: boolean;  // 預設 false
    inclusiveEnd: boolean;    // 預設 false
    excluded: number;         // 被視窗過濾掉的原始紀錄數
  };
  timeRange: { start: string | null; end: string | null; days: number };
};

export interface AnalyticsContainer {
  perNode: NodeStat[];
  global: GlobalStat;
  threshold: ThresholdView;
  meta: AnalyticsMeta;
}

export interface ProcessResult {
  records: RawRecord[];
  analytics: AnalyticsContainer;
}
```

---

## 5. 計算流程 (Pseudo Steps)
1. Parse CSV → 標準化 RawRecord（含 FrameType / ACK / Mac[]；數值欄位空值→null）。
2. 更新並確認 Analytics Meta 的 Rules 狀態。
3. 套用分析時間視窗 (`filterWindow`)：
   - 若 `filterWindow.start` 存在：`record.Time >= start` (或 > 若 inclusiveStart=false)
   - 若 `filterWindow.end` 存在：`record.Time <= end` (或 < 若 inclusiveEnd=false)
   - 不符合者移除並計數 `excluded`。
4. 過濾：遺失率與品質僅看上行 → `const upRecords = records.filter(r => r.FrameType?.isUp)`。
5. 依節點 (建議 key=`Devaddr`) 分組；同時計算兩個「全域集合」作為統計基準：
   - `globalFrequencies`：由所有上行 `Freq` 收集、去重並排序；供 frequencyCounts 對齊。
   - `globalGateways`：由所有上行 `Mac[]` 收集 Gateway MAC、去重並排序；供 gatewayCounts 對齊。
6. 每節點：
   - 依 Time 排序；以 Fcnt 遞減為重啟分段；segments `expected = Σ(lastFcnt - firstFcnt + 1)`。
   - unique 與 duplicate：以 Map<Fcnt,count> 判斷；duplicatePackets = totalWithDuplicates - uniquePackets；duplicateRate = duplicatePackets/totalWithDuplicates*100（分母 0 → -1）。
   - 品質平均：RSSI/SNR 忽略無效值；加總/樣本數；無樣本→null。
   - timeline：最早/最晚時間、fcntSpan（不足兩筆→-1）、resetCount。
   - daily：依 UI 指定 IANA 時區（未指定則本地）切日，重算上述邏輯；日界線 GAP 也會偵測（00:00~首筆、末筆~23:59:59）。
   - frequencies：total 與 daily 都輸出 `frequenciesUsed` 與 `frequencyCounts`（以全域基準補零對齊）。
   - gateways：total 與 daily 都輸出 `gatewaysUsed` 與 `gatewayCounts`（以全域基準補零對齊）。
   - GAP：若提供 `gapThresholdMinutes`，偵測相鄰紀錄與（分析起點→首筆）的時間差；daily 另含日界線；輸出 `lossGapFcnt/lossGapTime/maxGapMinutes` 與（總體）`maxGapMinutes`。
7. Global：
   - 直接對全部上行重跑與節點相同邏輯（單一集合）；daily：依日期重算。
   - `global.total.frequenciesUsed = globalFrequencies`；`global.total.gatewaysUsed = globalGateways`。
8. Threshold / 分類：
   - 執行 rule-based 評估：依 `classification.rules` 產出每節點單一主分類；輸出三分類視圖。
9. Meta：
   - `filterWindow`、`timeRange`、`classification`、`resetRule='any-decrease'`、`includeDownlinkInQuality=false`、`timezone`。
10. 如後續修改規則或時區/補齊策略，需重新執行以上流程。

### 5.A 無資料日補齊（No-Data Day Fill → 100% Loss）
動機：確保「全期間節點數」與「任一天的節點數」一致，避免圖表在選定某日時出現節點數降低；同時將「當天完全未上傳」視為 100% 掉包。

規格：
- 啟用條件：`meta.dailyFill.enabled === true` 且 `meta.dailyFill.mode === 'no-data-100-loss'`。
- 範圍：`timeRange` 內的每一個日期（以 UI 指定 IANA 時區；未指定則系統本地），對每一個節點都應有一筆 `NodeDailyStat`。
- 若某節點於該日無任何上行紀錄：
  1) 產生一筆補齊日統計 (`noData = true`)。
  2) `total = 0`, `duplicatePackets = 0`, `totalWithDuplicates = 0`, `resetCount = 0`, `duplicateRate=-1`。
  3) `expected` 由 `expectedBaseline` 決定：
     - 'per-node-daily-median'：取該 node 有資料日的 `expected` 中位數；若不存在則 fallback 至 `fixedExpected`；仍無則用 `minExpected`（預設 1）。
     - 'fixed'：直接使用 `fixedExpected`（預設 1）。
     設 `expectedSource` 與 `baselineExpected`。
  4) `lost = expected`，`lossRate = 100`；品質欄位 null；時間欄位 null；fcntSpan=-1；gap 欄位可省略或 `maxGapMinutes=1440`（若啟用 GAP）。
  5) `frequenciesUsed = []`, `frequencyCounts` 以全域基準填 0；`gatewaysUsed = []`, `gatewayCounts` 以全域基準填 0。
- Global.daily 聚合：
  - `nodesTotal` 固定等於全期間節點總數。
  - `nodes` 為實際有上行資料的節點數。
  - `expected/ lost/ lossRate` 等含補齊日資料。

---

## 6. 指標定義 & 公式

| 指標 | 定義 |
|------|------|
| uniquePackets | Fcnt 去重後的上行封包數 (每 Fcnt 只算一次) |
| totalWithDuplicates | 上行封包原始計數（含重複） |
| duplicatePackets | totalWithDuplicates - uniquePackets (>=0) |
| duplicateRate | (duplicatePackets / totalWithDuplicates)*100；若分母為 0 → -1 (sentinel) |
| expected | Σ 每個 segment (lastFcnt - firstFcnt + 1)；單一紀錄 segment => 1 |
| lost | max(expected - uniquePackets, 0) |
| lossRate | (lost / expected)*100；若 expected=0 視為不可計算 → 設為 -1 (sentinel) |
| avgRSSI / avgSNR | 有效樣本平均 (總和 / 样本數)；無樣本 => null |
| fcntSpan | (最後一筆 up Fcnt) - (第一筆 up Fcnt)；若不足 2 筆 => -1 (sentinel) |
| resetCount | 依時間排序後遇 `curr.Fcnt < prev.Fcnt` 次數 |
| dataRatesUsed | Set(Datarate) 排序後輸出 |
| nodes (global) | 有上行紀錄的節點數 |
| lossGapFcnt | 相鄰兩筆（或邊界）時間差 > `gapThresholdMinutes` 的 FCnt 邊界配對：`Array<[prevFcnt|null,nextFcnt|null]>` （Advanced）|
| lossGapTime | 同上時間 ISO 邊界：`Array<[prevTimeISO|null,nextTimeISO|null]>` （Advanced）|
| maxGapMinutes | 該日或總體的最大 gap 分鐘數；無 gap => -1（Advanced 指標；不再觸發 exception） |
| sentinel 值說明 | -1 代表「不可計算 / 資料不足」而非真實 0；前端應以特殊顯示(如 '--') |
| noData | 布林；若為補齊日則 true |
| expectedSource/baselineExpected | 僅補齊日出現 |
| frequenciesUsed | 數列：範圍內實際出現過的頻率（排序去重）。`global.frequenciesUsed` 為全域基準。 |
| frequencyCounts | 以 `global.frequenciesUsed` 為基準的計數表（Record<string, number>）。未使用的頻率也有 key=0。 |
| gatewaysUsed | 陣列：範圍內實際被接收過的 Gateway MAC 地址（排序去重）。`global.gatewaysUsed` 為全域基準。 |
| gatewayCounts | 以 `global.gatewaysUsed` 為基準的計數表（Record<string, number>）。未接收的 gateway 也有 key=0。 |

---

## 7. 邊界情境與處理

| 情境 | 處理策略 |
|------|----------|
| expected=0 | lossRate = -1 (不可計算 sentinel)，lost=0 |
| 無 RSSI/SNR 樣本 | avgRSSI/avgSNR = null |
| Fcnt 欄位缺值 | 該紀錄不納入 unique/expected 計算，但仍可用於品質統計 |
| 單日只有 1 筆 | 正常：expected=1 → lossRate=0；fcntSpan=-1；resetCount=0 |
| 時間跨日 | 依 UI 指定 IANA 時區切分（未指定則使用系統本地）；日界線以該時區 00:00 與 23:59:59 計 |
| 下行是否納入品質平均 | 固定僅使用上行 (meta.includeDownlinkInQuality=false) |
| duplicated 判定 | 同 Devaddr + 同 Fcnt -> 重複 |
| 重置判定 | `curr.Fcnt < prev.Fcnt` |
| 分析時間視窗 | 先比對 `filterWindow`，不在區間的原始紀錄直接過濾；`filterWindow.excluded` 紀錄被剔除數量 |
| 當日完全無資料 | 若 `meta.dailyFill.enabled`，則生成補齊日，並在 global.daily 維持 `nodesTotal` 為固定全期間節點數 |

---

## 8. 範例輸出（最終結構）

```jsonc
{
  "records": [ { "Time": "2025-08-19T03:04:26.000Z", "Devname":"WISE-2410-VibTest", "Devaddr":"FFB1FA66", "Fcnt":18302, "Freq":923.4, "RSSI":-91, "SNR":7.2, "Port":1, "FrameType":{"isUp":true,"confirmed":true}, "ACK":false, "Datarate":"SF7BW125", "Mac":["0016C001F1DE40D9"], "MacCommand":"", "Data":"817E3A..." } ],
  "analytics": {
    "perNode": [
      {
        "id": { "devName":"WISE-2410-VibTest", "devAddr":"FFB1FA66" },
        "total": { 
          "uniquePackets":120, 
          "totalWithDuplicates":123, 
          "expected":125, 
          "lost":5, 
          "lossRate":4, 
          "duplicatePackets":3,
          "duplicateRate":2.44,
          "resetCount":1,
          "avgRSSI":-89.4, 
          "avgSNR":7.1, 
          "dataRatesUsed":["SF7BW125","SF8BW125"],
          "frequenciesUsed": [923.4, 921.2],
          "frequencyCounts": { "923.4": 80, "921.2": 40, "919.0": 0 },
          "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD"],
          "gatewayCounts": { "0016C001F1DE40D9": 70, "AA1234567890ABCD": 50, "BB9876543210DCBA": 0 },
          "gapThresholdMinutes": 10,
          "lossGapFcnt": [ [10100, 10125], [10500, 11020] ],
          "lossGapTime": [ ["2025-08-19T02:10:02.000Z", "2025-08-19T02:35:30.000Z"], ["2025-08-19T05:00:10.000Z", "2025-08-19T06:45:05.000Z"] ],
          "maxGapMinutes": 105
        },
        "timeline": { "firstTime":"2025-08-19T00:01:02.000Z", "lastTime":"2025-08-19T23:59:40.000Z", "fcntSpan":520, "resetCount":1 },
        "daily": [ 
          { "date":"2025-08-19", "total":120, "expected":125, "lost":5, "lossRate":4, "avgRSSI":-89.4, "avgSNR":7.1, "firstTime":"2025-08-19T00:01:02.000Z", "lastTime":"2025-08-19T23:59:40.000Z", "fcntSpan":520, "duplicatePackets":3, "totalWithDuplicates":123, "duplicateRate":2.44, "resetCount":1, "dataRatesUsed":["SF7BW125","SF8BW125"], "frequenciesUsed": [923.4], "frequencyCounts": { "923.4": 120, "921.2": 0, "919.0": 0 }, "gatewaysUsed": ["0016C001F1DE40D9"], "gatewayCounts": { "0016C001F1DE40D9": 120, "AA1234567890ABCD": 0, "BB9876543210DCBA": 0 }, "lossGapFcnt": [ [10100, 10125] ], "lossGapTime": [ ["2025-08-19T02:10:02.000Z", "2025-08-19T02:35:30.000Z"] ], "maxGapMinutes": 25 },
          { "date":"2025-08-20", "total":0, "expected":120, "lost":120, "lossRate":100, "avgRSSI":null, "avgSNR":null, "firstTime":null, "lastTime":null, "fcntSpan":-1, "duplicatePackets":0, "totalWithDuplicates":0, "duplicateRate":-1, "resetCount":0, "dataRatesUsed":[], "frequenciesUsed": [], "frequencyCounts": { "923.4": 0, "921.2": 0, "919.0": 0 }, "gatewaysUsed": [], "gatewayCounts": { "0016C001F1DE40D9": 0, "AA1234567890ABCD": 0, "BB9876543210DCBA": 0 }, "noData": true, "expectedSource": "baseline-median", "baselineExpected": 120, "maxGapMinutes": 1440 }
        ]
      }
    ],
    "global": {
      "total": { "nodes":4, "uniquePackets":480, "totalWithDuplicates":495, "duplicatePackets":15, "duplicateRate":3.03, "expected":500, "lost":20, "lossRate":4, "avgRSSI":-90.2, "avgSNR":6.9, "firstTime":"2025-08-19T00:00:30.000Z", "lastTime":"2025-08-19T23:59:59.000Z", "fcntSpan":2050, "resetCount":3, "dataRatesUsed":["SF7BW125","SF8BW125","SF9BW125"], "frequenciesUsed": [923.4, 921.2, 919.0], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD", "BB9876543210DCBA"] },
      "daily": [ 
        { "date":"2025-08-19", "nodes":4, "nodesTotal":4, "uniquePackets":480, "totalWithDuplicates":495, "duplicatePackets":15, "duplicateRate":3.03, "expected":500, "lost":20, "lossRate":4, "avgRSSI":-90.2, "avgSNR":6.9, "firstTime":"2025-08-19T00:00:30.000Z", "lastTime":"2025-08-19T23:59:59.000Z", "fcntSpan":2050, "resetCount":3, "dataRatesUsed":["SF7BW125","SF8BW125","SF9BW125"], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD", "BB9876543210DCBA"] },
        { "date":"2025-08-20", "nodes":3, "nodesTotal":4, "uniquePackets":360, "totalWithDuplicates":372, "duplicatePackets":12, "duplicateRate":3.23, "expected":480, "lost":120, "lossRate":25, "avgRSSI":-90.5, "avgSNR":6.8, "firstTime":"2025-08-20T00:00:12.000Z", "lastTime":"2025-08-20T23:59:40.000Z", "fcntSpan":1800, "resetCount":2, "dataRatesUsed":["SF7BW125","SF8BW125"], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD"] }
      ]
    },
    "threshold": {
      "total": { "normalcnt":4, "abnormalcnt":2, "exceptioncnt":1, "normal":["WISE-2410-VibTest","DeviceX","WISE-NodeY","WISE-NodeZ"], "abnormal":["WISE-4610-S617","DeviceW"], "exception":["VIS_CDA6"] },
      "list": [ { "date":"2025-08-19", "normalcnt":2, "abnormalcnt":1, "exceptioncnt":1, "normal":["WISE-2410-VibTest","DeviceX"], "abnormal":["WISE-4610-S617"], "exception":["VIS_CDA6"] } ],
      "thresholdValue": 5,
      "exceptionResetThreshold": 3,
      "exceptionRule": "resetCount >= 3"
    },
    "meta": {
      "generatedAt":"2025-08-19T12:00:00.000Z",
      "version":"2.0.0",
      "includeDownlinkInQuality":false,
      "lossRateScope":"uplink-only",
      "resetRule":"any-decrease",
      "timezone":"Asia/Taipei",
      "timeRange": { "start":"2025-08-19T00:00:30.000Z", "end":"2025-08-19T23:59:59.000Z", "days":1 },
      "classification": {
        "version": "1.0.0",
        "defaultCategory": "normal",
        "rules": [
          { "metric": "resetCount", "op": ">=", "value": 3, "category": "exception", "note": "resetCount >= 3" },
          { "metric": "maxGapMinutes", "op": ">=", "value": 60, "category": "exception", "note": "No Data Gap >= 60 min" },
          { "metric": "lossRate", "op": ">", "value": 5, "category": "abnormal", "note": "lossRate > 5%" }
        ],
        "metricsAlias": { "lossRate": "Loss Rate %", "resetCount": "FCnt Resets" }
      }
    }
  }
}
```

---

## 9. 後續擴充建議
| 類別 | 想法 |
|------|------|
| 方向拆分 | 增加 `perNode.total.uplink` / `perNode.total.downlink` 子統計 |
| 時間視窗 | 滑動視窗 (最近 X 小時) 實時計算 |
| 快取 | 以 (Devaddr, 日) 為 key 做增量更新 |
| 大數據 | 改為串流計算 + Web Worker / WASM 加速 |
| 匯出 | 提供 `analytics` → CSV / Parquet 轉換層 |
| 例外細分 | 新增不同例外類型：如時間戳漂移、低品質訊號 (RSSI/SNR) 門檻、極端重複率等多重 Exception tag |
| 規則擴充 | 支援複合條件 (AND/OR) 或權重評分後分類（score-based） |

---

## 10. 實作小提醒
1. 運算順序：先節點再全域，但全域建議直接重算避免累積誤差。
2. Date 物件統一在輸出層做 ISO 化；避免重複序列化。
3. 若資料量大可先依 Devaddr 分桶再內部排序以減少比較成本。
4. 支援增量追加檔案時，可保留 per-node 狀態 (最後 Fcnt、最後時間、segments)。


---

（本文即為最終版規格。）

