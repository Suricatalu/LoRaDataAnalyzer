# 資料格式與統計分析規格（方案 B：重構後最終版）

更新日期：2025-08-19（採用新 CSV 標題 + 全新統計容器 `analytics` 重構）

新增：FCnt Reset 例外分類 `exception` 規格（第三分類），並引入「規則式 (rule-based) 多指標分類」（僅單一主分類，不含 tags 機制）。

本文目標：
1. 定義新 CSV 欄位對內部標準欄位的映射與轉型規則。
2. 描述標準化後 `RawRecord` 結構（含 FrameType/ACK）。
3. 定義重構後統計核心架構（最終版）：`analytics.perNode` / `analytics.global` / `analytics.threshold` / `analytics.meta`。
4. 提供完整 TypeScript 介面（無過渡欄位）。
5. 說明 10 項擴充指標的計算公式與流程（Pseudo Steps）。
6. 範例輸出 JSON（含 `exception` 節點與 rules-based classification 示例）。
7. 邊界情境與後續擴充建議。

> 舊版的 `organizedRecords.*` 架構已淘汰，僅保留本文件最終版 `analytics` 定義；不再提供任何過渡 (legacy) 欄位。

---

## 1. 新 CSV 欄位映射與轉型

| CSV 原始欄位 | 範例值 | 內部欄位 | 轉型 / 說明 |
|---------------|--------|----------|-------------|
| Received | 2025-08-19 11:04:26 | Time | 轉 `Date` (`YYYY-MM-DD HH:mm:ss`)；失敗 fallback `new Date()` |
| Device Name | WISE-2410-VibTest | Devname | 必填字串，缺失捨棄 |
| Type | Confirmed_Up | FrameType | 拆成 `{ isUp: boolean; confirmed: boolean }`；`_Up/_Down` + `Confirmed/Unconfirmed` |
| DevAddr | FFB1FA66 | Devaddr | 必填字串，缺失捨棄 |
| MAC | 0016C001F1DE40D9(換行...) | Mac | 若多行以 `\n` 切成 `string[]` |
| U/L RSSI | -91 | RSSI | `number`；空字串忽略平均計算樣本 |
| U/L SNR | 7.2 | SNR | `number`；同上 |
| FCnt | 18302 | Fcnt | `number` |
| Datarate | SF7BW125 | Datarate | 原字串保留 |
| ACK | true / false | ACK | `boolean` (LoRaWAN ACK bit，非 confirmed flag) |
| Port | 1 | Port | `number` |
| Frequency | 923.4 | Freq | `number` |
| MAC Command | 069306 | MacCommand | 字串，可空 |
| Data | 817E3A... | Data | Hex Payload |

新增邏輯欄位：
| 欄位 | 來源/規則 |
|------|-----------|
| FrameType.isUp | `Type` 含 `_Up` => true；含 `_Down` => false |
| FrameType.confirmed | `Type` 以 `Confirmed` 開頭 => true；否則 false |
| ACK | 直接對應 CSV 欄位 |

> 舊欄位 `Cnf` 由 `FrameType.confirmed` 取代；如需過渡可暫存 `record.Cnf = FrameType.confirmed` 並標記 deprecated。

過濾規則：`Devname` 或 `Devaddr` 缺失剔除；時間解析失敗 fallback；其餘欄位空值不強制填補。

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

> 遺失率與品質計算預設僅使用上行 (`FrameType.isUp === true`) 記錄。是否納入下行可後續在 `analytics.meta` 配置。

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
* exception：命中 FCnt Reset 等高優先級規則（例如 `resetCount >= 0`）。

說明：
* 真正的分類邏輯集中在 `meta.classification.rules`。
* 不支援 tags；第一個命中規則即為結果；未命中則 defaultCategory。
* 若未來增加更多類別（如 `weak-signal`, `noisy`），可自行決定是否將其視為 abnormal 或保留在外（目前視圖仍只渲染三類）。

支援欄位（沿用，部分將標記為衍生）：
* `byDate`：依日期的三分類詳情陣列。
* `thresholdValue`：主要 lossRate 規則門檻（若 rules 中存在對 `lossRate` 第一個 stop 規則可同步填入）。
* `exceptionResetThreshold`：FCnt Reset 例外門檻（由相對應規則抽出）。
* `exceptionRule`：文字化規則描述（來源於對應規則 note 或自動生成）。

預設建議：`exceptionResetThreshold = 0`（可依實務調整；設定為 `null` / `undefined` 代表停用該規則）。

> threshold 區塊不再直接主導分類，只是將 rule-based 結果映射回傳統三分類，保留相容性。

### 3.4 meta
執行參數（版本、重置阈值、是否包含下行、資料時間範圍）。

----

## 4. TypeScript 型別（最終）

```ts
// 4.1 原始記錄
export type RawRecord = {
	Time: Date;
	Devname: string;
	Devaddr: string;
	Fcnt: number;
	Freq: number;
	RSSI: number;
	SNR: number;
	Port: number;
	FrameType?: { isUp: boolean; confirmed: boolean };
	ACK?: boolean;
	Datarate?: string;
	Mac?: string[];
	MacCommand?: string;
	Data?: string;
};

// 4.2 節點每日統計
export type NodeDailyStat = {
	date: string;                // YYYY-MM-DD (UTC)
	total: number;               // unique 上行
	expected: number;            // segment expected sum
	lost: number;                // expected - total
	lossRate: number;            // %
	avgRSSI: number | null;
	avgSNR: number | null;
	firstTime: string | null;    // ISO
	lastTime: string | null;     // ISO
	fcntSpan: number;            // lastFcnt - firstFcnt + 1 (同日)
	duplicatePackets: number;    // totalWithDuplicates - total
	totalWithDuplicates: number; // 上行紀錄含重複
	// noData: 若此日沒有任何原始上行紀錄，但經補齊策略產生的虛構日統計，則為 true
	noData?: boolean;
	// expectedSource: 此日 expected 的來源，用於前端提示
	// - 'fcnt': 由當日實際 Fcnt 段落計算
	// - 'baseline-fixed': 由固定基準（配置）補齊
	// - 'baseline-median': 由該 node 有資料日期的 expected 中位數補齊
	// - 'interpolated': 由前/後日趨勢估算
	expectedSource?: 'fcnt' | 'baseline-fixed' | 'baseline-median' | 'interpolated';
	// baselineExpected: 若為補齊日，記錄用來計算 100% loss 的期望值（便於檢視）
	baselineExpected?: number;
	// gatewaysUsed: 當日該 node 使用過的 Gateway 清單（去重並排序的 MAC 地址）
	gatewaysUsed?: string[];
	// gatewayCounts: 以全域 Gateway 集合（由所有 node 的 records 決定）為基準，記錄當日每個 Gateway 被該 node 使用的次數。
	// 形式為 Record<string, number>，key 為 Gateway MAC 地址，若該 node 當日未使用某 Gateway 則會有該 key 並且值為 0。
	gatewayCounts?: Record<string, number>;
	resetCount: number;          // FCnt 重置次數
	dataRatesUsed: string[];     // 排序後去重
	lossGapFcnt?: Array<[number|null, number|null]>; // 當日 gap FCnt 邊界
	lossGapTime?: Array<[string|null, string|null]>; // 當日 gap 時間邊界
	// frequenciesUsed: 當日該 node 實際出現過的頻率清單 (numeric array，排序後去重)
	frequenciesUsed?: number[];
	// frequencyCounts: 以全域頻率集合 (由所有 node 的 records 決定) 為基準，記錄當日每個頻率被該 node 使用的次數。
	// 形式為 Record<string, number>，key 為頻率字串化（例如 "923.4"），若該 node 當日未使用某頻率則會有該 key 並且值為 0。
	frequencyCounts?: Record<string, number>;
	// gatewaysUsed: 當日該 node 實際被接收過的 Gateway 清單（去重並排序的 MAC 地址）
	gatewaysUsed?: string[];
	// gatewayCounts: 以全域 Gateway 集合 (由所有 node 的 records 決定) 為基準，記錄當日每個 Gateway 接收該 node 的次數。
	// 形式為 Record<string, number>，key 為 Gateway MAC 地址，若該 Gateway 當日未接收該 node 則會有該 key 並且值為 0。
	gatewayCounts?: Record<string, number>;
};

// 4.3 節點整體統計
export type NodeStat = {
	id: { devName: string; devAddr: string };
	total: {
		uniquePackets: number;
		totalWithDuplicates: number;
		expected: number;
		lost: number;
		lossRate: number;          // %
		duplicatePackets: number;  // totalWithDuplicates - uniquePackets
		resetCount: number;        // 新增：同 timeline.resetCount，為了前端彙總排序方便複製一份
		avgRSSI: number | null;    // null 代表無樣本
		avgSNR: number | null;
		dataRatesUsed: string[];
	// frequenciesUsed: 全期間該 node 實際出現過的頻率清單 (numeric array，排序後去重)
	frequenciesUsed?: number[];
	// frequencyCounts: 以全域頻率集合為基準，記錄此 node 在整個分析期間每個頻率被使用的次數 (缺少頻率亦會以 0 表示)
	// 形式為 Record<string, number>，key 為頻率字串化（例如 "923.4"）
	frequencyCounts?: Record<string, number>;
	// gatewaysUsed: 全期間該 node 實際被接收過的 Gateway 清單（去重並排序的 MAC 地址）
	gatewaysUsed?: string[];
	// gatewayCounts: 以全域 Gateway 集合為基準，記錄此 node 在整個分析期間每個 Gateway 接收的次數 (缺少 Gateway 亦會以 0 表示)
	// 形式為 Record<string, number>，key 為 Gateway MAC 地址
	gatewayCounts?: Record<string, number>;
	// gatewaysUsed: 全期間該 node 實際使用過的 Gateway 清單（去重並排序的 MAC 地址）
	gatewaysUsed?: string[];
	// gatewayCounts: 以全域 Gateway 集合為基準，記錄此 node 在整個分析期間每個 Gateway 被使用的次數 (缺少 Gateway 亦會以 0 表示)
	// 形式為 Record<string, number>，key 為 Gateway MAC 地址
	gatewayCounts?: Record<string, number>;
		// lossGapFcnt / lossGapTime：記錄『相鄰兩筆上行紀錄時間差超過設定閾值 (gapThresholdMinutes，單位：分鐘)』的 FCnt 與時間邊界。
		// 結構：每個元素為 [前一筆Fcnt|null, 下一筆Fcnt|null]；若當天缺前/後邊界以 null 表示，或是Start End Time邊界缺也試。
		// 對應時間陣列 lossGapTime 以 ISO string（或 null）存放對應兩側時間。
		// 例如：gap 發生在 r[i] 與 r[i+1] 之間，則 push [r[i].Fcnt, r[i+1].Fcnt] 與 [r[i].TimeISO, r[i+1].TimeISO]
		// 若第一筆與第二筆形成 gap，前一筆存在，下一筆存在 → 兩者都用具體值；只有在理論需補頭尾時才會出現 null（如欲標示前置或尾端無對應）。
		lossGapFcnt?: Array<[number|null, number|null]>; // 預設無 gap 為 [] 或 undefined
		lossGapTime?: Array<[string|null, string|null]>; // 與 lossGapFcnt 對位
		gapThresholdMinutes?: number; // 本次分析使用的 gap 閾值（分鐘），未設定則不計算
	};
	timeline: {
		firstTime: string | null;
		lastTime: string | null;
		fcntSpan: number;          // 全期間 last - first
		resetCount: number;
	};
	daily: NodeDailyStat[];      // 依日排序
};

// 4.4 全域每日
export type GlobalDailyStat = {
	date: string;
	nodes: number;               // 當日有上行資料節點數（相容保留）
	nodesTotal: number;          // 期望節點總數（含無資料但被補齊為 100% loss 的節點）
	uniquePackets: number;
	totalWithDuplicates: number;
	expected: number;
	lost: number;
	lossRate: number;
	avgRSSI: number | null;
	avgSNR: number | null;
	firstTime: string | null;
	lastTime: string | null;
	fcntSpan: number;            // 全部上行當日 fcnt 範圍
	resetCount: number;
	duplicatePackets: number;
	dataRatesUsed: string[];
	// frequenciesUsed: 當日全體 node 曾使用過的頻率集合 (numeric array，排序後去重)
	frequenciesUsed?: number[];
	// gatewaysUsed: 當日全體 node 曾被接收過的 Gateway 集合（去重並排序的 MAC 地址）
	gatewaysUsed?: string[];
};

// 4.5 全域統計
export type GlobalStat = {
	total: {
		nodes: number;
		uniquePackets: number;
		totalWithDuplicates: number;
		expected: number;
		lost: number;
		lossRate: number;
		avgRSSI: number | null;
		avgSNR: number | null;
		firstTime: string | null;
		lastTime: string | null;
		fcntSpan: number;          // 全部上行 first/last Fcnt 差值 (可跨節點)
		resetCount: number;
		duplicatePackets: number;
		dataRatesUsed: string[];
		// frequenciesUsed: 分析期間所有 node 曾使用過的頻率集合，為 frequencyCounts 的統計基準
		frequenciesUsed?: number[];
		// gatewaysUsed: 分析期間所有 node 曾被接收過的 Gateway 集合，為 gatewayCounts 的統計基準
		gatewaysUsed?: string[];
	};
	daily: GlobalDailyStat[];
};

// 4.6 閾值分類視圖
export type ThresholdView = {
	// total: 整個分析期間的總體三分類統計
	total: {
		normalcnt: number;
		abnormalcnt: number;
		exceptioncnt: number;
		normal: string[];      // devName 或 devAddr（取決於前端顯示策略）
		abnormal: string[];
		exception: string[];   // 被重置次數標記為例外
	};
	// list: 每日整體（UTC 日期）三分類摘要（exception 擁有最高優先級）
	list: Array<{
		date: string;
		normalcnt: number;
		abnormalcnt: number;
		exceptioncnt: number;
		normal: string[];      // devName 或 devAddr（取決於前端顯示策略）
		abnormal: string[];
		exception: string[];   // 被重置次數標記為例外
	}>;
	// byDate：可選，若需要細到多個批次或時段，可儲存更細顆粒（保留原結構並加入 exception）
	byDate?: Record<string, {
		normalcnt: number;
		abnormalcnt: number;
		exceptioncnt: number;
		normal: string[];
		abnormal: string[];
		exception: string[];
	}[]>;
	thresholdValue?: number;          // 遺失率閾值 (%)
	exceptionResetThreshold?: number; // FCnt Reset 次數門檻 (>= 此值 → exception)
	exceptionRule?: string;           // 文字化規則描述（例："resetCount >= 3"）
};

// 4.7 Meta
// 說明：
// 1. 品質平均 (RSSI/SNR) 固定僅使用上行，無需設定。
// 2. 重置判定簡化：任何 FCnt 遞減 (curr.Fcnt < prev.Fcnt) 即視為一次重啟；不再存在數值型 threshold。
// 3. `filterWindow`：使用者指定分析視窗；未指定的邊界為 null；`excluded` 紀錄因視窗被剔除的原始筆數。
// 4. `timeRange`：視窗過濾後參與統計的實際資料最早/最晚時間與天數 (UTC)。
// 規則式分類（單一主分類）：
//  - 依序檢查 rules，第一個命中規則即回傳其 category。
//  - 未命中任何規則 → defaultCategory。
export type ClassificationRule = {
	metric: string;                             // e.g. 'lossRate' | 'resetCount' | 'avgRSSI'
	op: '>' | '>=' | '<' | '<=' | 'between' | 'outside';
	value?: number;                             // 適用於 > >= < <=
	min?: number;                               // 適用於 between/outside
	max?: number;                               // 適用於 between/outside
	category: string;                           // 分類結果（例：'exception' | 'abnormal'）
	note?: string;                              // 規則說明
};

export type ClassificationConfig = {
    version?: string;                           // 規則版本
    defaultCategory: string;                    // 未命中任何終止規則時的主分類（例如 'normal'）
    rules: ClassificationRule[];                // 有序規則集合
    metricsAlias?: Record<string,string>;       // 友善名稱顯示
};

export type AnalyticsMeta = {
	generatedAt: string;        // ISO 時間
	version: string;            // e.g. '2.0.0'
	includeDownlinkInQuality: false; // 固定 false
	lossRateScope: 'uplink-only';    // 目前僅支援上行遺失率
	resetRule: 'any-decrease';       // 描述當前重置規則
	classification?: ClassificationConfig;      // 新的規則式分類設定
	// dailyFill: 控制「無資料日 = 100% 掉包」的補齊策略
	dailyFill?: {
		enabled: boolean;                      // 預設建議 true
		mode: 'no-data-100-loss';             // 現階段唯一模式
		expectedBaseline: 'per-node-daily-median' | 'fixed';
		// 當 expectedBaseline='fixed' 或找不到中位數時，使用此固定值（預設 1）
		fixedExpected?: number;
		// 底線，避免 0 導致百分比無法計算（預設 1）
		minExpected?: number;
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

// 4.8 Analytics 容器 & ProcessResult
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
1. Parse CSV → 標準化 RawRecord（含 FrameType / ACK / Mac[]）。
2. 更新與確認Analytics Meta的Rules狀態
2. 套用分析時間視窗 (`filterWindow`)：
	- 若 `filterWindow.start` 存在：`record.Time >= start` (或 > 若 inclusiveStart=false)
	- 若 `filterWindow.end` 存在：`record.Time <= end` (或 < 若 inclusiveEnd=false)
	- 不符合者移除並計數 `excluded`。
3. 過濾：遺失率與品質僅看上行 → `const upRecords = records.filter(r => r.FrameType?.isUp)`。
3. 依節點 (建議 key=`Devaddr`，同名多裝置可疊加或再加 devName) 分組。
	- 在分組前，先建立兩個「全域集合」作為統計基準：
	  1. 「全域頻率集合 (globalFrequencies)」：由所有 records（過濾後，即 `upRecords`）收集 `Freq` 欄位，去重並排序，作為 frequencyCounts 的統計基準。
	  2. 「全域網關集合 (globalGateways)」：由所有 records 收集 `Mac` 欄位中的 Gateway MAC 地址，去重並排序，作為 gatewayCounts 的統計基準。
	- globalFrequencies 用於確保每個 node 的 `frequencyCounts` 包含所有可能頻率的 key（即便該 node 未使用該頻率，其值也為 0），以便前端能夠對齊比較與顯示缺失頻率。
	- globalGateways 用於確保每個 node 的 `gatewayCounts` 包含所有可能 Gateway 的 key（即便該 node 未被該 Gateway 接收過，其值也為 0），以便前端能夠對齊比較與顯示覆蓋範圍。
4. 每節點：
	 - 依 Time 排序；建立 Fcnt 連續段 (遇 `curr.Fcnt < prev.Fcnt` 視為重啟)。
	 - 計算 segments `expected = Σ(lastFcnt - firstFcnt + 1)`。
	 - 以 Map<Fcnt, count> 判斷 unique 與 duplicate。
	 - 品質平均：RSSI/SNR 忽略空值；加總 / 有效樣本數。
	 - timeline：最早/最晚時間、fcnSpan = lastFcnt - firstFcnt (跨重置不拆)。
	 - daily：對 upRecords 依 UTC 日期聚合，重複上述節點內邏輯 (但在單日子集合內重計 expected / resetCount / spans)。

	 - 頻率統計（每日與總計）:
	   1. 建立 `globalFrequencies`（如上）後，對每個 node 計算 `frequenciesUsed` 與 `frequencyCounts`：
	      - `frequenciesUsed`：該 node 在整個分析期間或單日內實際出現過的頻率集合，排序後去重。
	      - `frequencyCounts`：以 `globalFrequencies` 為基準，對每個頻率計數該 node 在該時間範圍內出現的次數；若某頻率未被該 node 使用，仍需包含該 key 並設為 0。
	   2. 對 node 的 `total`（整段期間）與每個 `daily` 項目都要建立上述兩個欄位，保證前端能直接以相同的 frequency key 列表做比對與渲染。

	 - 網關統計（每日與總計）:
	   1. 建立 `globalGateways`（如上）後，對每個 node 計算 `gatewaysUsed` 與 `gatewayCounts`：
	      - `gatewaysUsed`：該 node 在整個分析期間或單日內實際被接收過的 Gateway MAC 地址集合，排序後去重。
	      - `gatewayCounts`：以 `globalGateways` 為基準，對每個 Gateway 計數該 node 在該時間範圍內被該 Gateway 接收的次數；若某 Gateway 未接收過該 node，仍需包含該 key 並設為 0。
	   2. 對 node 的 `total`（整段期間）與每個 `daily` 項目都要建立上述兩個欄位，保證前端能直接以相同的 Gateway key 列表做比對與渲染。

5. Global：
	 - 直接對全部 upRecords 重跑一次與節點相同邏輯（重置條件同樣使用 "any decrease"）。
	 - daily：合併全部 upRecords 依日期重算。

	 - 頻率統計（全域）:
	   1. `global.frequenciesUsed` 等於 `globalFrequencies`（分析期間所有 records 的頻率集合，排序去重），並作為 frequencyCounts 的統計基準。
	   2. `global.total` 可包含 `frequenciesUsed`（集合）以便檢視；若需要也可以在 global 層級提供頻率對應的總計 `frequencyCounts`（選項性）。

	 - 網關統計（全域）:
	   1. `global.gatewaysUsed` 等於 `globalGateways`（分析期間所有 records 的 Gateway 集合，排序去重），並作為 gatewayCounts 的統計基準。
	   2. `global.total` 可包含 `gatewaysUsed`（集合）以便檢視；若需要也可以在 global 層級提供 Gateway 對應的總計 `gatewayCounts`（選項性）。
6. Threshold / 分類：
	 - 執行 rule-based 評估：依 `classification.rules` 產出每節點單一主分類。
	 - 由結果映射生成傳統三分類視圖 (normal/abnormal/exception)。
7. Meta：
	 - `filterWindow`：輸入條件 + excluded 數。
	 - `timeRange`：過濾後資料 min/max Time 與 days。
	 - 其它：版本、resetRule='any-decrease'、固定 includeDownlinkInQuality=false、lossRateScope='uplink-only'。
8. 如後續觸發Meta Rules的改變，將重新計算以上數據的統計

### 5.A 無資料日補齊（No-Data Day Fill → 100% Loss）
動機：確保「全期間節點數」與「任一天的節點數」一致，避免圖表在選定某日時出現節點數降低；同時將「當天完全未上傳」視為 100% 掉包。

規格：
- 啟用條件：`meta.dailyFill.enabled === true` 且 `meta.dailyFill.mode === 'no-data-100-loss'`。
- 範圍：`timeRange` 內的每一個 UTC 日期，對每一個節點都應有一筆 `NodeDailyStat`。
- 若某節點於該日無任何上行紀錄：
	1) 產生一筆補齊日統計 (`noData = true`)。
	2) `total = 0`, `duplicatePackets = 0`, `totalWithDuplicates = 0`, `resetCount = 0`。
	3) `expected` 由 `expectedBaseline` 決定：
		 - 'per-node-daily-median'：取該 node 在有資料日期的 `expected` 中位數；若不存在則 fallback 至 `fixedExpected`；若仍無值則使用 `minExpected`（預設 1）。
		 - 'fixed'：直接使用 `fixedExpected`（預設 1）。
		 設 `expectedSource` 與 `baselineExpected` 以便前端顯示。
	4) `lost = expected`，`lossRate = 100`。
	5) 品質欄位無樣本：`avgRSSI = null`, `avgSNR = null`；時間欄位空：`firstTime = null`, `lastTime = null`, `fcntSpan = -1`；gap 欄位為空陣列或不輸出。
	6) `frequenciesUsed = []`, `frequencyCounts` 以全域基準填 0；`gatewaysUsed = []`, `gatewayCounts` 以全域基準填 0。
- Global.daily 聚合：
	- `nodesTotal` 固定等於全期間節點總數。
	- `nodes` 保留為「實際有上行資料的節點數」。
	- `expected/ lost/ lossRate` 等指標包含補齊日資料（即把無資料日也納入 100% 掉包計算）。
	- 這可確保圖表維度對齊且趨勢不受「資料缺失導致分母縮小」影響。

門檻與分類影響：
- 補齊日的 `lossRate = 100`，若分類規則含 lossRate 的異常判定，該日將歸入 abnormal；
- 若規則含 resetCount 的 exception，補齊日 `resetCount = 0` 不會誤觸；
- 視需要可透過規則 `metric='noData'`（未來擴充）單獨處理，現階段建議用 lossRate 規則即可涵蓋。

---

## 6. 指標定義 & 公式

| 指標 | 定義 |
|------|------|
| uniquePackets | Fcnt 去重後的上行封包數 (每 Fcnt 只算一次) |
| totalWithDuplicates | 上行封包原始計數（含重複） |
| duplicatePackets | totalWithDuplicates - uniquePackets (>=0) |
| resetCount (total) | 與 timeline.resetCount 相同，為方便前端直接在主表排序/過濾的鏡像欄位 |
| expected | Σ 每個 segment (lastFcnt - firstFcnt + 1)；單一紀錄 segment => 1 |
| lost | max(expected - uniquePackets, 0) |
| lossRate | (lost / expected)*100；若 expected=0 視為不可計算 → 設為 -1 (sentinel) |
| avgRSSI / avgSNR | 有效樣本加權平均 (總和 / 样本數)；無樣本 => null |
| fcntSpan | (最後一筆 up Fcnt) - (第一筆 up Fcnt)；若不足 2 筆 => -1 (sentinel，代表無法形成跨度) |
| resetCount | 依時間排序後遇 `curr.Fcnt < prev.Fcnt` 次數 |
| dataRatesUsed | Set(Datarate) 排序後輸出 |
| nodes (global) | 有上行紀錄的節點數 |
| exception (分類) | 若節點命中對應 resetCount 規則（例：`resetCount >= 3`）即標記（優先級由 rules 順序控制） |
| lossGapFcnt | 所有時間差 > gapThresholdMinutes*60*1000 對應的毫秒差之相鄰封包 FCnt 邊界配對清單：`Array<[prevFcnt|null,nextFcnt|null]>` |
| lossGapTime | 與 lossGapFcnt 對應的時間 ISO 邊界：`Array<[prevTimeISO|null,nextTimeISO|null]>` |
| gapThresholdMinutes | 本次分析判定 gap 所用的『分鐘』閾值（未提供則不計算上述兩欄） |
| gapCount | = lossGapFcnt.length；可用於分類規則 (例如 gapCount > 0) |
| maxGapMinutes | 所有偵測 gap 的最大分鐘差；無 gap => -1 (sentinel) |
| sentinel 值說明 | -1 代表「不可計算 / 資料不足」而非真實 0；前端應以特殊顯示(如 '--') |
| noData | 布林；若為補齊日則 true，僅出現在 NodeDailyStat，用於前端註記 |
| expectedSource/baselineExpected | 僅補齊日出現，顯示補齊依據與基準 |

| frequenciesUsed | 當一個集合（numeric array）：代表該節點或全域在指定時間範圍內實際出現過的頻率（排序後去重）。`global.frequenciesUsed` 為所有 node 共同的頻率基準。 |
| frequencyCounts | 以 `global.frequenciesUsed` 為基準的計數表（Record<string, number>），key 為頻率字串化（例如 "923.4"）；每個 node 的 `total` 與 `daily`、以及（選項性）global 層級可含此欄位；若某頻率未被該 node 使用，該 key 的值為 0。 |
| gatewaysUsed | 當一個集合（string array）：代表該節點或全域在指定時間範圍內實際被接收過的 Gateway MAC 地址（排序後去重）。`global.gatewaysUsed` 為所有 node 共同的 Gateway 基準。 |
| gatewayCounts | 以 `global.gatewaysUsed` 為基準的計數表（Record<string, number>），key 為 Gateway MAC 地址；每個 node 的 `total` 與 `daily`、以及（選項性）global 層級可含此欄位；若某 Gateway 未接收過該 node，該 key 的值為 0。 |

---

## 7. 邊界情境與處理

| 情境 | 處理策略 |
|------|----------|
| expected=0 | lossRate = -1 (不可計算 sentinel)，lost=0 |
| 無 RSSI/SNR 樣本 | avgRSSI/avgSNR = null |
| Fcnt 欄位缺值 | 該紀錄不納入 unique / expected 計算，但仍可用於品質統計（可配置） |
| 單日只有 1 筆 | 正常：expected=1 → lossRate=0；fcntSpan=-1 (不足兩筆跨度)；resetCount=0 |
| 時間跨日 | 依 UTC 日期切分（可後續提供時區參數） |
| 下行是否納入品質平均 | 不再支援；品質計算永遠只使用上行 (meta.includeDownlinkInQuality 固定 false) |
| duplicated 判定 | 同節點 Devaddr + 同 Fcnt -> 重複 (同時期/不同時間皆算) |
| 重置判定 | `curr.Fcnt < prev.Fcnt` (任何遞減即重置) |
| 重置意義 | 代表裝置重開機 / session 重啟 (FCnt 回繞或清零)；用於切 segment，避免跨生命週期累加 expected 造成膨脹 |
| 分析時間視窗 | 先比對 `filterWindow` (start/end)，不在區間的原始紀錄直接過濾；`filterWindow.excluded` 紀錄被剔除數量 |
| 當日完全無資料 | 若 `meta.dailyFill.enabled`，則生成補齊日：`expected` 依 baseline，`lost=expected`，`lossRate=100`，`noData=true`，品質/時間為空，counts 以全域基準填 0；並於 Global.daily 的 `nodesTotal` 保持全期間節點數 |

---

## 8. （移除遷移流程）
舊版結構已廢止，不再提供雙軌支援；所有前端應直接對接 `analytics`。

---

## 9. 範例輸出（最終結構）

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
					"lossGapTime": [ ["2025-08-19T02:10:02.000Z", "2025-08-19T02:35:30.000Z"], ["2025-08-19T05:00:10.000Z", "2025-08-19T06:45:05.000Z"] ]
				},
				"timeline": { "firstTime":"2025-08-19T00:01:02.000Z", "lastTime":"2025-08-19T23:59:40.000Z", "fcntSpan":520, "resetCount":1 },
				"daily": [ 
					{ "date":"2025-08-19", "total":120, "expected":125, "lost":5, "lossRate":4, "avgRSSI":-89.4, "avgSNR":7.1, "firstTime":"2025-08-19T00:01:02.000Z", "lastTime":"2025-08-19T23:59:40.000Z", "fcntSpan":520, "duplicatePackets":3, "totalWithDuplicates":123, "resetCount":1, "dataRatesUsed":["SF7BW125","SF8BW125"], "frequenciesUsed": [923.4], "frequencyCounts": { "923.4": 120, "921.2": 0, "919.0": 0 }, "gatewaysUsed": ["0016C001F1DE40D9"], "gatewayCounts": { "0016C001F1DE40D9": 120, "AA1234567890ABCD": 0, "BB9876543210DCBA": 0 }, "lossGapFcnt": [ [10100, 10125] ], "lossGapTime": [ ["2025-08-19T02:10:02.000Z", "2025-08-19T02:35:30.000Z"] ] },
					// 無資料日補齊範例：2025-08-20 當天沒有任何上行 → 以中位 expected=120 補齊，掉包率 100%
					{ "date":"2025-08-20", "total":0, "expected":120, "lost":120, "lossRate":100, "avgRSSI":null, "avgSNR":null, "firstTime":null, "lastTime":null, "fcntSpan":-1, "duplicatePackets":0, "totalWithDuplicates":0, "resetCount":0, "dataRatesUsed":[], "frequenciesUsed": [], "frequencyCounts": { "923.4": 0, "921.2": 0, "919.0": 0 }, "gatewaysUsed": [], "gatewayCounts": { "0016C001F1DE40D9": 0, "AA1234567890ABCD": 0, "BB9876543210DCBA": 0 }, "noData": true, "expectedSource": "baseline-median", "baselineExpected": 120 }
				]
			}
		],
		"global": {
			"total": { "nodes":4, "uniquePackets":480, "totalWithDuplicates":495, "expected":500, "lost":20, "lossRate":4, "avgRSSI":-90.2, "avgSNR":6.9, "firstTime":"2025-08-19T00:00:30.000Z", "lastTime":"2025-08-19T23:59:59.000Z", "fcntSpan":2050, "resetCount":3, "duplicatePackets":15, "dataRatesUsed":["SF7BW125","SF8BW125","SF9BW125"], "frequenciesUsed": [923.4, 921.2, 919.0], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD", "BB9876543210DCBA"] },
			"daily": [ 
				{ "date":"2025-08-19", "nodes":4, "nodesTotal":4, "uniquePackets":480, "totalWithDuplicates":495, "expected":500, "lost":20, "lossRate":4, "avgRSSI":-90.2, "avgSNR":6.9, "firstTime":"2025-08-19T00:00:30.000Z", "lastTime":"2025-08-19T23:59:59.000Z", "fcntSpan":2050, "resetCount":3, "duplicatePackets":15, "dataRatesUsed":["SF7BW125","SF8BW125","SF9BW125"], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD", "BB9876543210DCBA"] },
				// 範例：2025-08-20 有 1 個節點完全無上行 → nodes=3，但 nodesTotal 仍為 4；expected/lost/lossRate 已包含補齊日
				{ "date":"2025-08-20", "nodes":3, "nodesTotal":4, "uniquePackets":360, "totalWithDuplicates":372, "expected":480, "lost":120, "lossRate":25, "avgRSSI":-90.5, "avgSNR":6.8, "firstTime":"2025-08-20T00:00:12.000Z", "lastTime":"2025-08-20T23:59:40.000Z", "fcntSpan":1800, "resetCount":2, "duplicatePackets":12, "dataRatesUsed":["SF7BW125","SF8BW125"], "gatewaysUsed": ["0016C001F1DE40D9", "AA1234567890ABCD"] }
			]
		},
		"threshold": {
			"total": { "normalcnt":4, "abnormalcnt":2, "exceptioncnt":1, "normal":["WISE-2410-VibTest","DeviceX","WISE-NodeY","WISE-NodeZ"], "abnormal":["WISE-4610-S617","DeviceW"], "exception":["VIS_CDA6"] },
			"list": [ { "date":"2025-08-19", "normalcnt":2, "abnormalcnt":1, "exceptioncnt":1, "normal":["WISE-2410-VibTest","DeviceX"], "abnormal":["WISE-4610-S617"], "exception":["VIS_CDA6"] } ],
			"thresholdValue": 5,                 // 從第一個 lossRate 規則抽出（若存在）
			"exceptionResetThreshold": 3,        // 從 resetCount 規則抽出
			"exceptionRule": "resetCount >= 3"   // 來自規則 note 或動態生成
		},
		"meta": {
			"generatedAt":"2025-08-19T12:00:00.000Z",
			"version":"2.0.0",
			"resetThreshold":100,
			"includeDownlinkInQuality":false,
			"lossRateScope":"uplink-only",
			"timeRange": { "start":"2025-08-19T00:00:30.000Z", "end":"2025-08-19T23:59:59.000Z", "days":1 },
			"classification": {
				"version": "1.0.0",
				"defaultCategory": "normal",
				"rules": [
					{ "metric": "resetCount", "op": ">=", "value": 3, "category": "exception", "note": "resetCount >= 3" },
					{ "metric": "lossRate", "op": ">", "value": 5, "category": "abnormal", "note": "lossRate > 5%" }
				],
				"metricsAlias": { "lossRate": "Loss Rate %", "resetCount": "FCnt Resets" }
			}
		}
	}
}
```

---

## 10. 後續擴充建議
| 類別 | 想法 |
|------|------|
| 方向拆分 | 增加 `perNode.total.uplink` / `perNode.total.downlink` 子統計 |
| 時間視窗 | 滑動視窗 (最近 X 小時) 實時計算 |
| 快取 | 以 (Devaddr, 日) 為 key 做增量更新 |
| 大數據 | 改為串流計算 + Web Worker / WASM 加速 |
| 匯出 | 提供 `analytics` → CSV / Parquet 轉換層 |
| 例外細分 | 未來可新增不同例外類型：如時間戳漂移、低品質訊號 (RSSI/SNR 門檻)、極端重複率等多重 Exception tag |
| 規則擴充 | 支援複合條件 (AND/OR) 或權重評分後分類（score-based） |

---

## 11. 實作小提醒
1. 獨立一個 `metrics` 模組，避免 `parse` 與統計耦合。
2. 運算順序：先節點再全域，但全域建議直接重算避免累積誤差。
3. 避免多次 Date 物件序列化：統一在輸出層做 ISO 化。
4. 排序成本：若資料量大可先依 Devaddr 分桶再內部排序以減少比較。
5. 未來若要支援增量追加檔案，可保留 per-node 狀態 (最後 Fcnt、最後時間、segments)。

---

（本文即為最終版規格。）

