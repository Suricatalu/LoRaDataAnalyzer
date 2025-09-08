////////////////////////////////////////////////////////////////////////////////
// Advantech LoRa Data Analyzer
//
// Unified Parser API for WISE and EVA LoRa modules
//
// version: 1.0.0 <2025/08/27>
//
////////////////////////////////////////////////////////////////////////////////

/**
 * 統一的 LoRa 數據解析器 API
 * 自動檢測並解析 WISE 和 EVA 模組的數據
 */
class LoRaDataParser {
    constructor() {
        // 動態載入解析器
        if (typeof WiseLoRaParser !== 'undefined') {
            this.wiseParser = new WiseLoRaParser();
        }
        if (typeof EvaLoRaParser !== 'undefined') {
            this.evaParser = new EvaLoRaParser();
        }
        
        // 如果在 Node.js 環境中
        if (typeof require !== 'undefined') {
            try {
                const WiseLoRaParser = require('./wise-parser-api.js');
                const EvaLoRaParser = require('./eva-parser-api.js');
                this.wiseParser = new WiseLoRaParser();
                this.evaParser = new EvaLoRaParser();
            } catch (e) {
                console.warn('無法載入解析器模組:', e.message);
            }
        }
    }

    /**
     * 自動解析 LoRa 數據
     * @param {string} hexString - 十六進制字符串
     * @param {Object} options - 解析選項
     * @param {string} options.type - 解析器類型 ('wise', 'eva', 'auto')
     * @param {number} options.fport - fPort 值 (EVA 模組必需)
     * @param {string} options.macAddress - MAC 地址
     * @param {boolean} options.enableStorage - 是否啟用存儲
     * @returns {Object} 解析結果
     */
    parse(hexString, options = {}) {
        try {
            const {
                type = 'auto',
                fport,
                macAddress,
                enableStorage = false
            } = options;

            if (!hexString) {
                throw new Error('請提供十六進制數據字符串');
            }

            // 移除空格和換行符
            hexString = hexString.replace(/\s/g, '');

            // 驗證十六進制格式
            if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
                throw new Error('無效的十六進制格式');
            }

            let result;

            switch (type.toLowerCase()) {
                case 'wise':
                    result = this.parseWise(hexString, { macAddress, enableStorage });
                    break;
                case 'eva':
                    if (fport === undefined) {
                        throw new Error('EVA 模組解析需要提供 fport 參數');
                    }
                    result = this.parseEva(hexString, fport);
                    break;
                case 'auto':
                default:
                    result = this.autoDetectAndParse(hexString, options);
                    break;
            }

            return {
                ...result,
                parser: result.parser || type,
                timestamp: new Date().toISOString(),
                rawData: hexString
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null,
                parser: 'unknown',
                timestamp: new Date().toISOString(),
                rawData: hexString
            };
        }
    }

    /**
     * 解析 WISE 模組數據
     * @param {string} hexString - 十六進制字符串
     * @param {Object} options - 選項
     * @returns {Object} 解析結果
     */
    parseWise(hexString, options = {}) {
        if (!this.wiseParser) {
            throw new Error('WISE 解析器未載入');
        }

        const result = this.wiseParser.parse(hexString, options);
        return {
            ...result,
            parser: 'wise'
        };
    }

    /**
     * 解析 EVA 模組數據
     * @param {string} hexString - 十六進制字符串
     * @param {number} fport - fPort 值
     * @returns {Object} 解析結果
     */
    parseEva(hexString, fport) {
        if (!this.evaParser) {
            throw new Error('EVA 解析器未載入');
        }

        const result = this.evaParser.parse(hexString, fport);
        return {
            ...result,
            parser: 'eva'
        };
    }

    /**
     * 自動檢測並解析數據
     * @param {string} hexString - 十六進制字符串
     * @param {Object} options - 選項
     * @returns {Object} 解析結果
     */
    autoDetectAndParse(hexString, options = {}) {
        const detectionResult = this.detectDataType(hexString, options);
        
        if (detectionResult.type === 'eva') {
            return this.parseEva(hexString, options.fport || 6);
        } else if (detectionResult.type === 'wise') {
            return this.parseWise(hexString, options);
        } else {
            // 嘗試兩種解析器
            const results = [];
            
            // 先嘗試 WISE 解析器
            if (this.wiseParser) {
                try {
                    const wiseResult = this.parseWise(hexString, options);
                    if (wiseResult.success) {
                        results.push({ ...wiseResult, parser: 'wise' });
                    }
                } catch (e) {
                    // 忽略錯誤，繼續嘗試其他解析器
                }
            }

            // 嘗試 EVA 解析器
            if (this.evaParser && options.fport !== undefined) {
                try {
                    const evaResult = this.parseEva(hexString, options.fport);
                    if (evaResult.success) {
                        results.push({ ...evaResult, parser: 'eva' });
                    }
                } catch (e) {
                    // 忽略錯誤
                }
            }

            if (results.length === 0) {
                throw new Error('無法解析數據，請檢查數據格式或指定正確的解析器類型');
            }

            // 返回第一個成功的結果
            return results[0];
        }
    }

    /**
     * 檢測數據類型
     * @param {string} hexString - 十六進制字符串
     * @param {Object} options - 選項
     * @returns {Object} 檢測結果
     */
    detectDataType(hexString, options = {}) {
        const length = hexString.length / 2;
        
        // EVA 模組特徵檢測
        if (length >= 4 && length <= 22 && options.fport !== undefined) {
            const validFPorts = [6, 7, 14]; // EVA 支援的 fPort
            if (validFPorts.includes(options.fport)) {
                return {
                    type: 'eva',
                    confidence: 0.8,
                    reason: 'fPort 和數據長度符合 EVA 特徵'
                };
            }
        }

        // WISE 模組特徵檢測
        if (length >= 4) {
            const firstByte = parseInt(hexString.substring(0, 2), 16);
            
            // 檢查 WISE 幀頭特徵
            const hasFirstSegment = (firstByte & 0x80) !== 0;
            const frameVersion = firstByte & 0x03;
            
            if (frameVersion <= 1) {
                return {
                    type: 'wise',
                    confidence: 0.7,
                    reason: '幀版本和結構符合 WISE 特徵'
                };
            }
        }

        return {
            type: 'unknown',
            confidence: 0,
            reason: '無法確定數據類型'
        };
    }

    /**
     * 批量解析數據
     * @param {Array} dataArray - 數據陣列
     * @returns {Array} 解析結果陣列
     */
    parseBatch(dataArray) {
        return dataArray.map((item, index) => {
            try {
                if (typeof item === 'string') {
                    return this.parse(item);
                } else if (typeof item === 'object' && item.data) {
                    return this.parse(item.data, item.options || {});
                } else {
                    throw new Error('無效的數據格式');
                }
            } catch (error) {
                return {
                    success: false,
                    error: error.message,
                    index: index,
                    data: null
                };
            }
        });
    }

    /**
     * 獲取支援的設備類型
     * @returns {Object} 支援的設備類型
     */
    getSupportedDevices() {
        return {
            wise: {
                types: ['DI', 'DO', 'AI', 'Sensor', 'Device', 'Coil', 'Register', 'ApplicationRawData'],
                description: 'WISE LoRa 模組，支援多種 I/O 和感測器'
            },
            eva: {
                types: ['EVA-2210', 'EVA-2213', 'EVA-2310', 'EVA-2311', 'EVA-2510', 'EVA-2511'],
                description: 'EVA LoRa 模組，支援電流、溫濕度、漏水檢測等'
            }
        };
    }

    /**
     * 驗證數據格式
     * @param {string} hexString - 十六進制字符串
     * @returns {Object} 驗證結果
     */
    validateFormat(hexString) {
        const errors = [];
        const warnings = [];

        if (!hexString) {
            errors.push('數據不能為空');
            return { valid: false, errors, warnings };
        }

        // 移除空格
        hexString = hexString.replace(/\s/g, '');

        // 檢查十六進制格式
        if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
            errors.push('包含非十六進制字符');
        }

        // 檢查長度
        if (hexString.length % 2 !== 0) {
            errors.push('十六進制字符串長度必須為偶數');
        }

        const byteLength = hexString.length / 2;
        if (byteLength < 4) {
            warnings.push('數據長度較短，可能無法正確解析');
        }

        if (byteLength > 255) {
            warnings.push('數據長度較長，請確認是否正確');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            byteLength
        };
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoRaDataParser;
} else if (typeof window !== 'undefined') {
    window.LoRaDataParser = LoRaDataParser;
}
