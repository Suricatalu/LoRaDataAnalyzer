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
                type,
                fport,
                macAddress,
                enableStorage = true
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

            if (!type || typeof type !== 'string') {
                throw new Error('未指定解析器類型，請選擇 WISE 或 EVA');
            }

            const t = type.toLowerCase();
            if (t === 'wise') {
                result = this.parseWise(hexString, { macAddress, enableStorage });
            } else if (t === 'eva') {
                if (fport === undefined) {
                    throw new Error('EVA 模組解析需要提供 fport 參數');
                }
                result = this.parseEva(hexString, fport);
            } else {
                // 不支援的類型一律視為未指定
                throw new Error('未指定解析器類型，請選擇 WISE 或 EVA');
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

    // 已移除自動偵測與解析功能，強制要求明確指定解析器類型

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
if (typeof window !== 'undefined') {
    window.LoRaDataParser = LoRaDataParser;
}
