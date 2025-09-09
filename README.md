# LoRa 數據解析器 & WISE6610 多節點資料分析器

一個完整的 LoRa 數據解析與視覺化解決方案，包含：
1. **新的 API 模式解析器** - 支援 WISE 和 EVA LoRa 模組的程式化調用
2. **原有的前端分析器** - 純前端 CSV 解析與統計視覺化工具

## 🌟 解析器 API (新增功能)

### ✨ 特性

- 🔧 **統一 API**: 自動檢測並解析 WISE 和 EVA 模組數據
- 🌐 **跨平台**: 支援瀏覽器和 Node.js 環境  
- 📊 **實時解析**: 快速準確的數據解析
- 🎯 **多設備支援**: 支援多種 WISE 和 EVA 設備類型
- 💾 **數據導出**: 支援多種格式的數據導出
- 🧪 **完整測試**: 提供網頁和命令列測試工具

### 🚀 快速開始 (解析器 API)

#### 瀏覽器環境

```html
<script src="assets/wise-parser-api.js"></script>
<script src="assets/eva-parser-api.js"></script>
<script src="assets/lora-data-parser.js"></script>

<script>
const parser = new LoRaDataParser();
const result = parser.parse("014a00101209100011", { type: 'eva', fport: 6 });
console.log(result);
</script>
```

#### Node.js 環境

```bash
# 執行測試
npm test

# 單一數據解析
node test-parser.js --data "014a00101209100011" --type eva --fport 6

# 批量測試
node test-parser.js --batch
```

### 🎯 支援的設備

#### WISE 模組
- **DI (Digital Input)**: 數位輸入，支援計數器和頻率模式
- **DO (Digital Output)**: 數位輸出，支援脈衝輸出
- **AI (Analog Input)**: 類比輸入，支援多種量程
- **Sensor**: 感測器數據（溫濕度、加速度計等）
- **Device**: 設備狀態（電池、時間戳、GPS 等）

#### EVA 模組
- **EVA-2210/2213**: 電流感測器
- **EVA-2310**: 溫濕度感測器
- **EVA-2311**: 溫度感測器
- **EVA-2510**: 漏水檢測器
- **EVA-2511**: 狀態感測器

### 🧪 測試工具

- **網頁測試工具**: 開啟 `parser-test.html` 使用完整的圖形化測試介面
- **命令列工具**: 使用 `test-parser.js` 進行批量測試和性能測試

詳細 API 使用方法請參考 [API_USAGE.md](API_USAGE.md)

---

## 📊 前端資料分析器 (原有功能)

一個純前端（無後端依賴）的 CSV 解析與統計視覺化工具，支援多 LoRaWAN 節點上行品質分析、封包遺失率計算、FCnt Reset 偵測、規則式分類與互動圖表瀏覽。

### 特色總覽

- 新統計容器：`analytics`（`perNode / global / threshold / meta` 四層）
- 規則式單一主分類：依有序規則決定 `normal / abnormal / exception` 映射視圖
- FCnt Reset 精準切割：任何 `Fcnt` 遞減即視為 Reset，避免跨生命週期膨脹 expected
- 三層遺失統計：節點整體、節點每日、全域每日
- 重複封包 / 品質 (RSSI/SNR) / DataRate 使用概況
- Gap 偵測（選配）：可記錄時間間隔超過閾值的上下邊界 Fcnt 與時間
- Sentinel 與 Null 規範：`lossRate = -1` 代表不可計算、`avgRSSI = null` 代表無樣本
- 完全瀏覽器端運算：隱私與快速迭代友善
- 可選時區(Timezone) 篩選：時間視窗輸入支援自訂時區（預設為瀏覽器自動偵測），不會因重新上傳 CSV 而自動變更。

## 📁 文件結構

```
WISE6610DataAnalyzer_Front/
├── index.html                 # 原始主應用介面 (前端分析器)
├── parser-test.html           # 解析器 API 測試頁面 (新增)
├── test-parser.js             # Node.js 測試腳本 (新增)
├── API_USAGE.md              # API 使用說明 (新增)
├── package.json              # Node.js 專案配置 (新增)
├── README.md                 # 本文件
├── LICENSE
├── doc/
│   └── Analysis.md            # 規格文件（最終版）
└── assets/
      ├── lora-data-parser.js    # 統一解析器 API (新增)
      ├── wise-parser-api.js     # WISE 模組解析器 (新增)
      ├── eva-parser-api.js      # EVA 模組解析器 (新增)
      ├── app-controller.js      # 入口協調：檔案載入、事件綁定、觸發流程
      ├── data-processor-raw.js  # CSV 解析 & RawRecord 標準化
      ├── data-processor-analytics.js # 統計/聚合運算
      ├── data-processor.js      # （Legacy）即將移除：舊演算法入口
      ├── chart-manager.js       # Chart.js 視圖（遺失率、分類、每日趨勢）
      ├── table-manager.js       # DataTables 表格（節點與每日細節）
      ├── style.css              # UI 樣式
      └── data-parser-wise.js / data-parser-eva.js # 原始解析器 (Node-RED 格式)
```

## CSV 匯入欄位（新版映射）

原始檔（例如 `doc/HistoryRecords.csv`）標題：

| CSV 欄位 | 範例 | 內部欄位 | 說明 / 轉型 |
|----------|------|----------|-------------|
| Received | 2025-08-19 11:04:26 | Time | 轉 `Date` (YYYY-MM-DD HH:mm:ss) 失敗則 fallback now |
| Device Name | WISE-2410-VibTest | Devname | 必填；缺失剔除 |
| Type | Confirmed_Up | FrameType | 解析為 `{ isUp, confirmed }` |
| DevAddr | FFB1FA66 | Devaddr | 必填；缺失剔除 |
| MAC | 0016C001F1DE40D9 | Mac | 多行切 `\n` → `string[]` |
| U/L RSSI | -91 | RSSI | `number`；空值不列入平均 |
| U/L SNR | 7.2 | SNR | `number`；空值不列入平均 |
| FCnt | 18302 | Fcnt | `number` |
| Datarate | SF7BW125 | Datarate | 原字串保留 |
| ACK | true | ACK | LoRaWAN ACK bit（非 confirm flag）|
| Port | 1 | Port | number |
| Frequency | 923.4 | Freq | number |
| MAC Command | 069306 | MacCommand | 可空 |
| Data | 817E3A... | Data | Hex Payload |

## 使用流程

### 解析器 API 模式
1. 載入解析器模組
2. 創建解析器實例
3. 調用 `parse()` 方法解析十六進制數據
4. 獲取結構化解析結果

### 前端分析器模式
1. 上傳 / 貼上 CSV：支援含表頭的標準匯出檔
2. 解析階段：`data-processor-raw.js` 建立 `RawRecord[]`
3. 統計階段：`data-processor-analytics.js` 產出 `analytics`
4. 規則分類：於統計中套用 `meta.classification.rules`
5. UI 呈現：`chart-manager.js` 與 `table-manager.js` 根據最新 `analytics` 重繪
 6. （可選）調整 Timezone 下拉：改變之後，時間篩選區間的解析與顯示將以該時區解讀。

## 圖表與表格

- 節點總覽表：遺失率、重置次數、平均 RSSI/SNR、DataRate 列表
- 分類圖：三分類（normal / abnormal / exception）數量堆疊或條狀
- 每日遺失率趨勢：可點擊篩選節點
- Gap / Reset 等進階欄位可在表格開啟（未來新增）

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request 來改進這個專案。

## 📄 許可證

本專案基於原始 Advantech 解析器代碼開發，請遵循相應的許可證條款。

## 🔗 相關連結

- [解析器 API 詳細文檔](API_USAGE.md)
- [前端分析器規格文件](doc/Analysis.md)
- [原始專案](https://github.com/Suricatalu/LoRaDataAnalyzer)
- [Advantech 官網](https://www.advantech.com)

## Changelog

### v2.1.0 (2025-08-27) - API 解析器版本
- 新增統一的 LoRa 數據解析器 API
- 支援 WISE 和 EVA 模組的程式化調用
- 提供瀏覽器和 Node.js 雙環境支援
- 新增完整的測試工具和文檔
- 保持與原有前端分析器的完全相容性

### v2.0.0 (2025-08-20) - 前端分析器更新
- 配置最新的 CSV 檔案內容規劃
- 採用方案 B：`analytics` 重構（perNode / global / threshold / meta）
- 新增 rule-based classification 與三分類映射
- 新增 FCnt Reset 規則：`any-decrease`
- 將 Raw / Analytics 拆分為獨立處理模組

### v1.0.0 (2025-08-07) - 初版釋出
- 基本 CSV 解析、遺失率計算與視覺化、表格、閾值過濾

---

若需更完整的使用說明，請參考：
- 解析器 API：[API_USAGE.md](API_USAGE.md)
- 前端分析器：[doc/Analysis.md](doc/Analysis.md)

## CSV 匯入欄位（新版映射）

原始檔（例如 `doc/HistoryRecords.csv`）標題：

| CSV 欄位 | 範例 | 內部欄位 | 說明 / 轉型 |
|----------|------|----------|-------------|
| Received | 2025-08-19 11:04:26 | Time | 轉 `Date` (YYYY-MM-DD HH:mm:ss) 失敗則 fallback now |
| Device Name | WISE-2410-VibTest | Devname | 必填；缺失剔除 |
| Type | Confirmed_Up | FrameType | 解析為 `{ isUp, confirmed }` |
| DevAddr | FFB1FA66 | Devaddr | 必填；缺失剔除 |
| MAC | 0016C001F1DE40D9 | Mac | 多行切 `\n` → `string[]` |
| U/L RSSI | -91 | RSSI | `number`；空值不列入平均 |
| U/L SNR | 7.2 | SNR | `number`；空值不列入平均 |
| FCnt | 18302 | Fcnt | `number` |
| Datarate | SF7BW125 | Datarate | 原字串保留 |
| ACK | true | ACK | LoRaWAN ACK bit（非 confirm flag）|
| Port | 1 | Port | number |
| Frequency | 923.4 | Freq | number |
| MAC Command | 069306 | MacCommand | 可空 |
| Data | 817E3A... | Data | Hex Payload |

新增邏輯欄位：`FrameType.isUp`, `FrameType.confirmed`, `ACK`（直接映射）。

## RawRecord 範例

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
   "Data": "817E3A..."
}
```

## Analytics 統計容器概述

```ts
interface AnalyticsContainer {
   perNode: NodeStat[];   // 每節點統計 + daily
   global: GlobalStat;    // 全域總覽 + daily
   threshold: ThresholdView; // 三分類視圖 (由 rules 映射)
   meta: AnalyticsMeta;   // 版本、時間視窗、規則、產生時間
}
```

核心指標（節錄）：

- expected = Σ 各段 (segment) `(lastFcnt - firstFcnt + 1)`（以 Reset 分段）
- uniquePackets：去重後 Fcnt 數
- duplicatePackets = totalWithDuplicates - uniquePackets
- loss = max(expected - uniquePackets, 0)
- lossRate = (lost / expected) * 100；expected=0 → -1 (sentinel)
- resetCount：`curr.Fcnt < prev.Fcnt` 次數
- fcntSpan：最後 - 最初；不足兩筆 → -1
- avgRSSI / avgSNR：僅上行且有效值平均；無樣本 → null
- gap 相關：`lossGapFcnt` / `lossGapTime`（需提供 `gapThresholdMs`）

### 規則式分類（Classification）

1. 依序檢查 `classification.rules`
2. 第一個命中 → 該節點主分類 = rule.category
3. 全部未命中 → 使用 `defaultCategory`（通常為 normal）
4. `threshold` 區塊僅將結果映射為：`normal / abnormal / exception` 三視圖以供既有圖表使用

典型規則例：
```jsonc
{
   "defaultCategory": "normal",
   "rules": [
      { "metric": "resetCount", "op": ">=", "value": 1, "category": "exception", "note": "Any FCnt reset" },
      { "metric": "lossRate", "op": ">", "value": 5, "category": "abnormal", "note": ">5% loss" }
   ]
}
```

### Sentinel / Null 政策

| 欄位 | 值 | 意義 |
|------|----|------|
| lossRate | -1 | 無法計算（expected=0）|
| fcntSpan | -1 | 範圍不足（<2 筆）|
| maxGapMs | -1 | 無 gap | 
| avgRSSI/SNR | null | 無有效樣本 |

前端顯示建議：以 `--` 或灰字呈現，避免誤解為 0。

## 使用流程

1. 上傳 / 貼上 CSV：支援含表頭的標準匯出檔。
2. 解析階段：`data-processor-raw.js` 建立 `RawRecord[]`（無副作用）。
3. 統計階段：`data-processor-analytics.js` 產出 `analytics`。
4. 規則分類：於統計中套用 `meta.classification.rules` → 更新 `threshold` 視圖。
5. UI 呈現：`chart-manager.js` 與 `table-manager.js` 根據最新 `analytics` 重繪。

> 時間視窗過濾（可選）會先於統計前剔除不在範圍的原始資料，並記錄 `meta.filterWindow.excluded`。

## 圖表與表格

- 節點總覽表：遺失率、重置次數、平均 RSSI/SNR、DataRate 列表
- 分類圖：三分類（normal / abnormal / exception）數量堆疊或條狀
- 每日遺失率趨勢：可點擊篩選節點
- Gap / Reset 等進階欄位可在表格開啟（未來新增）

## 邊界與特殊處理摘要

- Fcnt Reset：任何遞減；切 segment 並 +1 resetCount
- Duplicate：同節點 + 同 Fcnt 多筆 → 重複
- 下行封包：忽略於遺失率與品質平均（統一 uplink-only）
- 缺 Fcnt：可計入品質平均，但不納入 expected / unique 計算（實作層可配置）

## 範例來源片段 (`HistoryRecords.csv`)

```csv
Received,Device Name,Type,DevAddr,MAC,U/L RSSI,U/L SNR,FCnt,Datarate,ACK,Port,Frequency,MAC Command,Data
2025-08-19 11:04:25,WISE-2410-VibTest,Confirmed_Up,FFB1FA66,0016C001F1DE40D9,-91,7.2,18302,SF7BW125,false,1,923.4,,817E3A50...
2025-08-19 11:03:22,WISE-4610-S617,Confirmed_Up,FF5BDF2B,0016C001F1DE40D9,-90,-9.5,38079,SF10BW125,false,1,923.4,069306,01BF6888
2025-08-19 10:40:24,VIS_CDA6,Confirmed_Up,FFA9010C,0016C001F1DE40D9,-93,-4,1361,SF8BW125,false,1,923.4,,81514050...
```

## 開發說明

| 模組 | 職責 | 備註 |
|------|------|------|
| app-controller | 流程編排 / 事件 | 單例模式 |
| data-processor-raw | CSV → RawRecord | 僅純函式，易於測試 |
| data-processor-analytics | RawRecord[] → AnalyticsContainer | 可拆 metrics 子模組（未來） |
| chart-manager | Chart.js 管理 | 支援重繪 / 高亮 |
| table-manager | DataTables | 動態欄位、排序 |
| data-processor (legacy) | 舊路徑 | 待刪除 |

建議後續增量：
- 引入單元測試（可用 Vitest / Jest）
- Web Worker 將 heavy 統計移出主執行緒
- 增加 rules 編輯 UI（目前由程式碼內建）

## 遷移指引（v1 → v2）

| 項目 | 舊版 | 新版 |
|------|------|------|
| 主結果物件 | `organizedRecords` | `analytics` |
| 遺失率欄位 | 分散 | `NodeStat.total.lossRate` |
| Reset 判定 | 可能有閾值 | 任一遞減 -> reset |
| 分類 | Threshold 二分 | Rule-based 多指標（再映射三類） |
| Cnf | `Cnf` | `FrameType.confirmed` |
| 上/下行範圍 | 混用可配置 | 固定 uplink-only |

## 貢獻

歡迎提出 Issue / PR：
- Bug 重現步驟 + 範例 CSV
- 規格差異 / 指標定義疑問
- 新增指標或分類建議

## Changelog

### v2.0.0 (2025-08-20)
- 是配最新的 CSV 檔案內容規劃
- 採用方案 B：`analytics` 重構（perNode / global / threshold / meta）
- 新增 rule-based classification 與三分類映射
- 新增 FCnt Reset 規則：`any-decrease`
- 將 Raw / Analytics 拆分為獨立處理模組
- 支援 duplicate / gap (準備) / dataRatesUsed / resetCount 鏡像欄位
- 統一 uplink-only 品質統計與遺失率計算
- 以 sentinel/Null 政策標準化不可計算情境

### v1.0.0 (2025-08-07)
- 初版釋出：基本 CSV 解析、遺失率計算與視覺化、表格、閾值過濾

## 注意事項

- 請確認 CSV 標題與欄位格式符合「CSV 匯入欄位（新版映射）」章節。
- 若載入資料量過大（>50k 筆）可能造成主執行緒卡頓，建議後續改以增量/Worker 模式。
- `data-processor.js` 已進入 deprecate 期，不再接受新功能。

---

若需更完整型別定義與流程細節，請參考：`doc/Analysis.md`。
