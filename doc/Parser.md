# LoRa 數據解析器 API 說明文件

本專案提供了三個主要的解析器 API，用於解析 Advantech WISE 和 EVA LoRa 模組的數據。

## 文件結構

- `wise-parser-api.js` - WISE LoRa 模組解析器
- `eva-parser-api.js` - EVA LoRa 模組解析器  
- `lora-data-parser.js` - 統一解析器 API

## 快速開始

### 1. 在瀏覽器中使用

```html
<!DOCTYPE html>
<html>
<head>
    <title>LoRa 數據解析器示例</title>
</head>
<body>
    <!-- 載入解析器 -->
    <script src="assets/wise-parser-api.js"></script>
    <script src="assets/eva-parser-api.js"></script>
    <script src="assets/lora-data-parser.js"></script>
    
    <script>
        // 創建統一解析器實例
        const parser = new LoRaDataParser();
        
        // 解析 WISE 數據
        const wiseData = "818D4E5007060000B45F00005538E2FF000014001E001500F4FF67012E00180006000000150020001700E6FF8E0226001A00040000001B0026001B000000000000000000000060091B0001000047D7895CF0";
        const wiseResult = parser.parse(wiseData, { type: 'wise' });
        console.log('WISE 解析結果:', wiseResult);
        
        // 解析 EVA 數據
        const evaData = "014a00101209100011";
        const evaResult = parser.parse(evaData, { type: 'eva', fport: 6 });
        console.log('EVA 解析結果:', evaResult);
    </script>
</body>
</html>
```

### 2. 在 Node.js 中使用

```javascript
// 載入解析器
const LoRaDataParser = require('./assets/lora-data-parser.js');

// 創建解析器實例
const parser = new LoRaDataParser();

// 解析數據
const hexData = "014a00101209100011";
const result = parser.parse(hexData, { 
    type: 'eva', 
    fport: 6 
});

console.log('解析結果:', result);
```

## API 參考

### LoRaDataParser 類

#### 構造函數
```javascript
const parser = new LoRaDataParser();
```

### WiseLoRaParser 類 (增強版)

#### 構造函數
```javascript
// 選項 1: 內存存儲 (預設，適用於 Node.js)
const parser = new WiseLoRaParser();

// 選項 2: 瀏覽器持久化存儲
const parser = new WiseLoRaParser({ enableBrowserStorage: true });
```

#### 增強功能

##### 狀態管理系統
替代原始 Node-RED 的 `context.set()` 和 `context.get()` 機制：

```javascript
// Node-RED 原始用法
context.set("FFTDataStorage" + payload_mac, objData);
var data = context.get("FFTDataStorage" + payload_mac);

// 新增的 API 用法
parser.setContext("FFTDataStorage" + macAddress, objData);
var data = parser.getContext("FFTDataStorage" + macAddress);
```

##### 狀態管理方法

###### setContext(key, value)
存儲狀態數據

**參數:**
- `key` (string): 存儲鍵值
- `value` (any): 要存儲的數據

###### getContext(key)
讀取狀態數據

**參數:**
- `key` (string): 存儲鍵值

**返回值:**
- 存儲的數據或 `undefined`

###### clearContext(key)
清除指定的狀態數據

**參數:**
- `key` (string): 要清除的存儲鍵值

##### FFT 數據處理
支援完整的 FFT 數據重組和軸向分析

##### 封包重組功能
支援多段數據包的自動重組

#### 主要方法

##### parse(hexString, options)
解析 LoRa 數據

**參數:**
- `hexString` (string): 十六進制數據字符串
- `options` (object): 解析選項
  - `type` (string): 解析器類型 ('wise', 'eva', 'auto')
  - `fport` (number): fPort 值 (EVA 模組必需)
  - `macAddress` (string): MAC 地址
  - `enableStorage` (boolean): 是否啟用存儲

**返回值:**
```javascript
{
    success: true,           // 解析是否成功
    data: {...},            // 解析後的數據
    parser: 'wise',         // 使用的解析器
    timestamp: '2025-08-27T...', // 解析時間戳
    rawData: '014a00...',   // 原始十六進制數據
    csvData: '...',         // CSV 格式數據 (僅 WISE)
    lostPacketInfo: {...}   // 丟失封包資訊 (僅 WISE)
}
```

##### parseWise(hexString, options)
專門解析 WISE 模組數據

**參數:**
- `hexString` (string): 十六進制數據字符串
- `options` (object): 
  - `macAddress` (string): MAC 地址
  - `enableStorage` (boolean): 是否啟用存儲

**增強版額外選項:**
- `enableStorage` (boolean): 控制是否啟用狀態管理 (預設: true)

**增強版返回值:**
包含原有欄位，另外新增：
```javascript
{
    success: true,
    data: {...},
    lostPacketInfo: {...},   // 遺失封包資訊
    isReassembled: true,     // 是否為重組數據
    segmentInfo: {...}       // 分段資訊
}
```

##### parseEva(hexString, fport)
專門解析 EVA 模組數據

**參數:**
- `hexString` (string): 十六進制數據字符串
- `fport` (number): fPort 值 (6, 7, 或 14)

##### parseBatch(dataArray)
批量解析數據

**參數:**
- `dataArray` (array): 數據陣列

##### validateFormat(hexString)
驗證數據格式

**參數:**
- `hexString` (string): 十六進制數據字符串

**返回值:**
```javascript
{
    valid: true,            // 格式是否有效
    errors: [],            // 錯誤列表
    warnings: [],          // 警告列表
    byteLength: 16         // 位元組長度
}
```

##### getSupportedDevices()
獲取支援的設備類型

**返回值:**
```javascript
{
    wise: {
        types: ['DI', 'DO', 'AI', 'Sensor', ...],
        description: 'WISE LoRa 模組...'
    },
    eva: {
        types: ['EVA-2210', 'EVA-2213', ...],
        description: 'EVA LoRa 模組...'
    }
}
```

## 使用示例

### 示例 1: 自動檢測解析器類型

```javascript
const parser = new LoRaDataParser();

// 自動檢測並解析
const result = parser.parse("014a00101209100011", { 
    type: 'auto',
    fport: 6 
});

if (result.success) {
    console.log('設備類型:', result.data.DeviceType);
    console.log('使用的解析器:', result.parser);
} else {
    console.error('解析失敗:', result.error);
}
```

### 示例 2: 批量解析

```javascript
const parser = new LoRaDataParser();

const dataArray = [
    { data: "014a00101209100011", options: { type: 'eva', fport: 6 }},
    { data: "818D4E5007060000B45F", options: { type: 'wise' }},
    "0295010064006400c8"
];

const results = parser.parseBatch(dataArray);
results.forEach((result, index) => {
    if (result.success) {
        console.log(`數據 ${index + 1} 解析成功:`, result.data);
    } else {
        console.error(`數據 ${index + 1} 解析失敗:`, result.error);
    }
});
```

### 示例 3: 數據驗證

```javascript
const parser = new LoRaDataParser();

const validation = parser.validateFormat("014a00101209100011");
if (validation.valid) {
    console.log('數據格式有效，位元組長度:', validation.byteLength);
} else {
    console.error('數據格式錯誤:', validation.errors);
}

if (validation.warnings.length > 0) {
    console.warn('警告:', validation.warnings);
}
```

### 示例 4: WISE 感測器數據解析

```javascript
const parser = new LoRaDataParser();

// WISE 溫濕度感測器數據
const wiseData = "815004500100640064";
const result = parser.parse(wiseData, { type: 'wise' });

if (result.success && result.data.TempHumi) {
    console.log('溫度:', result.data.TempHumi.SenVal);
    console.log('感測器範圍:', result.data.TempHumi.Range);
}
```

### 示例 5: EVA 設備版本資訊

```javascript
const parser = new LoRaDataParser();

// EVA-2310 版本資訊
const evaData = "000b001e050a0b0c0d";
const result = parser.parse(evaData, { type: 'eva', fport: 6 });

if (result.success) {
    console.log('設備類型:', result.data.DeviceType);
    console.log('軟體版本:', result.data.SoftwareVersion);
    console.log('硬體版本:', result.data.HardwareVersion);
    console.log('韌體版本:', result.data.FirmwareVersion);
}
```

## WISE 增強版使用示例

### 示例 6: FFT 數據處理

```javascript
const WiseLoRaParser = require('./assets/wise-parser-api.js');
const parser = new WiseLoRaParser();

const result = parser.parse(fftData, {
    macAddress: "device_mac_address",
    enableStorage: true  // 必須啟用才能重組分段數據
});

if (result.success && result.data.FFT) {
    console.log('FFT 數據:', result.data.FFT);
    console.log('軸向分析:', result.data.FFT.AxisData);
    console.log('CSV 格式:', result.data.FFT.CSVData);
}
```

### 示例 7: 封包重組

```javascript
const parser = new WiseLoRaParser();

// 首段數據包
const result1 = parser.parse(firstSegment, {
    macAddress: "device_001",
    enableStorage: true
});

// 後續段數據包
const result2 = parser.parse(secondSegment, {
    macAddress: "device_001",
    enableStorage: true
});

// 自動檢測完整性並重組
if (result2.success && result2.data.IsComplete) {
    console.log('數據重組完成:', result2.data);
}
```

### 示例 8: 瀏覽器中的狀態管理

```html
<script src="assets/wise-parser-api.js"></script>
<script>
const parser = new WiseLoRaParser({ enableBrowserStorage: true });

// 解析數據
const result = parser.parse(hexData, {
    macAddress: deviceMac,
    enableStorage: true
});

// 數據會自動保存到 localStorage

// 狀態管理
parser.setContext('lastProcessTime', Date.now());
parser.setContext('deviceConfig', { interval: 60, mode: 'continuous' });

// 讀取狀態
const lastTime = parser.getContext('lastProcessTime');
const config = parser.getContext('deviceConfig');

// 清除狀態
parser.clearContext('lastProcessTime');
</script>
```

### 示例 9: 增強版錯誤處理

```javascript
const result = parser.parse(data, options);

if (!result.success) {
    switch (result.error) {
        case 'Sequence number error. Packet may be lost.':
            // 處理遺失封包
            console.warn('封包遺失，序號錯誤');
            break;
        case 'Invalid data format':
            // 處理格式錯誤
            console.error('數據格式無效');
            break;
        default:
            console.error('未知錯誤:', result.error);
    }
}
```

## 支援的設備類型

### WISE 模組
- **DI (Digital Input)**: 數位輸入，支援計數器和頻率模式
- **DO (Digital Output)**: 數位輸出，支援脈衝輸出
- **AI (Analog Input)**: 類比輸入，支援多種量程
- **Sensor**: 感測器數據，包括溫濕度、加速度計等
- **Device**: 設備狀態，包括電池、時間戳、GPS 等
- **Coil**: Modbus 線圈數據
- **Register**: Modbus 暫存器數據
- **ApplicationRawData**: 應用原始數據

### EVA 模組
- **EVA-2210/2213**: 電流感測器
- **EVA-2310**: 溫濕度感測器
- **EVA-2311**: 溫度感測器
- **EVA-2510**: 漏水檢測器
- **EVA-2511**: 狀態感測器

## 錯誤處理

所有解析方法都會返回包含 `success` 欄位的結果物件：

```javascript
// 成功解析
{
    success: true,
    data: {...},
    parser: 'wise'
}

// 解析失敗
{
    success: false,
    error: "錯誤訊息",
    data: null
}
```

常見錯誤：
- `"No data is received"`: 沒有提供數據
- `"received frame length error"`: 數據長度錯誤
- `"Frame CRC check failed"`: CRC 校驗失敗
- `"Unknown DeviceType"`: 未知設備類型
- `"Unknown fPort"`: 未知 fPort 值
- `"Sequence number error. Packet may be lost."`: 封包序號錯誤，可能有封包遺失 (增強版)
- `"Invalid data format"`: 數據格式無效 (增強版)

## 注意事項

1. **EVA 模組解析需要 fPort**: EVA 模組的解析必須提供正確的 fPort 值
2. **數據格式**: 輸入的十六進制字符串不應包含 "0x" 前綴
3. **大小寫**: 十六進制字符串支援大小寫混合
4. **空格處理**: API 會自動移除字符串中的空格和換行符
5. **瀏覽器兼容性**: 支援 ES6+ 的現代瀏覽器
6. **Node.js 支援**: 支援 Node.js 環境

### 增強版特別注意事項

7. **狀態管理**: 增強版 WISE 解析器支援狀態管理，用於處理分段數據和 FFT 重組
8. **存儲選項**: 
   - 內存存儲 (預設，適用於 Node.js)
   - 瀏覽器持久化存儲 (localStorage)
   - 完全關閉存儲 (`enableStorage: false`)
9. **FFT 數據處理**: 需要啟用存儲才能進行分段 FFT 數據的重組
10. **封包重組**: 自動處理分段傳輸的數據包，需要提供 macAddress 進行設備識別

## 功能比較表

| 功能 | 標準版 LoRaDataParser | 增強版 WiseLoRaParser |
|------|----------------------|---------------------|
| 基本 WISE 解析 | ✅ | ✅ |
| EVA 解析 | ✅ | ❌ |
| 狀態管理 | ❌ | ✅ |
| FFT 數據重組 | ❌ | ✅ |
| 封包重組 | ❌ | ✅ |
| 瀏覽器存儲 | ❌ | ✅ |
| 批量處理 | ✅ | ✅ |
| 自動檢測 | ✅ | ❌ |

## 與原始版本的對應關係

| 原始 Node-RED 功能 | 增強版 API 功能 | 說明 |
|-------------------|-----------------|------|
| `context.set()` | `parser.setContext()` | 狀態存儲 |
| `context.get()` | `parser.getContext()` | 狀態讀取 |
| `msg.payload` | `options.macAddress` | 設備識別 |
| Node-RED flow | 自動存儲管理 | 分段數據處理 |
| 內建重組邏輯 | `handlePacketReassembly()` | 封包重組 |
| FFT 處理 | `parseFFTData()` | FFT 數據解析 |

## 效能優化

### 增強版效能特性

1. **智能存儲**: 只在需要時啟用狀態管理
2. **記憶體管理**: 自動清理過期的分段數據
3. **批次處理**: 支援大量數據的高效處理
4. **錯誤恢復**: 遺失封包的自動檢測和處理

## 相容性

### 增強版相容性

- ✅ **瀏覽器環境**: 使用 localStorage 或 memory storage
- ✅ **Node.js 環境**: 使用 Map storage
- ✅ **向前相容**: 保持原有 API 不變
- ✅ **ES5/ES6**: 支援舊版和新版 JavaScript

## 測試

### 增強版測試

執行完整的功能測試：

```bash
node test-enhanced-parser.js
```

測試涵蓋：
- ✅ 基本解析功能
- ✅ 狀態管理
- ✅ 分段數據處理
- ✅ 錯誤處理
- ✅ 跨環境相容性

## 許可證

本專案基於原始 Advantech 解析器代碼開發，請遵循相應的許可證條款。

## 總結

### 標準版 LoRaDataParser

提供統一的 LoRa 數據解析接口，支援 WISE 和 EVA 模組的基本解析功能，適合大多數應用場景。

### 增強版 WiseLoRaParser

增強版的 `wise-parser-api.js` 現在完全具備了原始 Node-RED 版本的所有功能，同時提供了更好的：

1. **可移植性** - 可在任何 JavaScript 環境中使用
2. **靈活性** - 多種存儲選項和配置
3. **穩定性** - 完整的錯誤處理和恢復機制
4. **效能** - 優化的內存使用和批次處理

現在您可以根據需求選擇適合的解析器：
- 需要 EVA 模組支援或簡單使用：選擇 `LoRaDataParser`
- 需要進階 WISE 功能 (FFT、狀態管理、封包重組)：選擇 `WiseLoRaParser`
