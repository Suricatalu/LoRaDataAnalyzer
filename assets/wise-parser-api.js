////////////////////////////////////////////////////////////////////////////////
// Advantech, iSensing SW team
//
// Frame Data Parser for WISE Lora modules - API Version
//
// version: 1.7.5 <2025/01/21>
// API version: 1.0.0 <2025/08/27>
//
////////////////////////////////////////////////////////////////////////////////

/**
 * WISE LoRa 數據解析器 API
 * 支援多種設備類型的數據解析，包括 DI、DO、AI、感測器、設備狀態等
 * 支援完整的狀態管理功能，包括 FFT 數據重組和封包重組
 */
class WiseLoRaParser {
    constructor(options = {}) {
        this.initConstants();
        this.initCRCTable();
        
        // 初始化狀態存儲 - 替代 Node-RED context
        this.contextStore = options.contextStore || new Map();
    }

    /**
     * 初始化常數
     */
    initConstants() {
        // Frame length
        this.MIN_FRAME_LENGTH = 4;

        // Header
        this.MASK_HEADER_FIRST_SEGMENT = 0x80;
        this.MASK_HEADER_FRAME_CONTROL2_EXIST = 0x20;
        this.MASK_HEADER_ADDRESS_MODE = 0x0C;
        this.MASK_HEADER_ADDRESS_NONE = 0x00;
        this.MASK_HEADER_ADDRESS_2_OCTECT = 0x04;
        this.MASK_HEADER_ADDRESS_8_OCTECT = 0x08;
        this.MASK_HEADER_FRAME_VERSION = 0x03;

        // Payload Data Types
        this.PAYLOAD_DI_DATA = 0x00;
        this.PAYLOAD_DO_DATA = 0x10;
        this.PAYLOAD_AI_DATA = 0x30;
        this.PAYLOAD_SENSOR_DATA = 0x50;
        this.PAYLOAD_DEVICE_DATA = 0x60;
        this.PAYLOAD_COIL_DATA = 0x70;
        this.PAYLOAD_REGISTER_DATA = 0x80;
        this.PAYLOAD_APP_RAW_DATA = 0xA0;

        // DI Masks
        this.MASK_PAYLOAD_DI_STATUS = 0x01;
        this.MASK_PAYLOAD_DI_VALUE = 0x02;
        this.MASK_PAYLOAD_DI_EVENT = 0x04;
        this.DI_MODE_FREQUENCY = 4;

        // DO Masks
        this.MASK_PAYLOAD_DO_STATUS = 0x01;
        this.MASK_PAYLOAD_DO_ABSOLUTE_PULSE_OUTPUT = 0x02;
        this.MASK_PAYLOAD_DO_INCREMENTAL_PULSE_OUTPUT = 0x04;

        // AI Masks
        this.MASK_PAYLOAD_AI_STATUS = 0x01;
        this.MASK_PAYLOAD_AI_RAW_VALUE = 0x02;
        this.MASK_PAYLOAD_AI_EVENT = 0x04;
        this.MASK_PAYLOAD_AI_MAX_VALUE = 0x08;
        this.MASK_PAYLOAD_AI_MIN_VALUE = 0x10;
        this.MASK_PAYLOAD_AI_MASK2_RANGE = 0x01;

        // Sensor Types
        this.MASK_PAYLOAD_SENSOR_TEMP_C_TYPE = 0x00;
        this.MASK_PAYLOAD_SENSOR_TEMP_F_TYPE = 0x01;
        this.MASK_PAYLOAD_SENSOR_TEMP_K_TYPE = 0x02;
        this.MASK_PAYLOAD_SENSOR_HUMIDITY_TYPE = 0x03;
        this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_G = 0x04;
        this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_MS2 = 0x05;

        // Sensor Masks
        this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_STATUS = 0x01;
        this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_EVENT = 0x02;
        this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_VALUE = 0x04;
        this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_MAX_VALUE = 0x08;
        this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_MIN_VALUE = 0x10;

        this.MASK_PAYLOAD_SENSOR_AXIS_X_MASK = 0x01;
        this.MASK_PAYLOAD_SENSOR_AXIS_Y_MASK = 0x02;
        this.MASK_PAYLOAD_SENSOR_AXIS_Z_MASK = 0x04;

        this.MASK_PAYLOAD_SENSOR_MASK2_LOGINDEX = 0x01;
        this.MASK_PAYLOAD_SENSOR_MASK2_TIME = 0x02;

        // Sensor Extended Masks
        this.MASK_PAYLOAD_SENSOR_EXTMASK_VELOCITY = 0x01;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_PEAK = 0x02;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_RMS = 0x04;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_KURTOSIS = 0x08;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_CRESTFACTOR = 0x10;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_SKEWNESS = 0x20;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_STDDEVIATION = 0x40;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_DISPLACEMENT = 0x80;

        // Massive Data
        this.MASK_PAYLOAD_SENSOR_EXTMASK_B = 0x01;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_INFO = 0x01;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_SEC = 0x02;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_LOG = 0x04;

        // Massive Data Type
        this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_MASSIVE_TYPE = 0x03;
        this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_SAMPLE_PER_AXIS = 0x0C;
        this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_BYTES_PER_SAMPLE = 0x10;
        this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_MASSIVE_TYPE_FFT = 0x01;

        // Massive Data
        this.MASK_PAYLOAD_SENSOR_EXTMASK_B = 0x01;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_INFO = 0x01;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_SEC = 0x02;
        this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_LOG = 0x04;

        // Device Status
        this.MASK_DEVICE_EVENT = 0x01;
        this.MASK_DEVICE_POWER_SOURCE = 0x02;
        this.MASK_DEVICE_BATTERY_LEVEL = 0x04;
        this.MASK_DEVICE_BATTERY_VOLTAGE = 0x08;
        this.MASK_DEVICE_TIMESTAMP = 0x10;
        this.MASK_DEVICE_POSITION = 0x20;

        this.MASK_DEVICE_POSITION_LATITUDE = 0x02;
        this.MASK_DEVICE_POSITION_LONGITUDE = 0x01;

        // Coil Data
        this.MASK_PAYLOAD_COIL_STATUS = 0x01;
        this.MASK_PAYLOAD_COIL_VALUE = 0x02;
        this.MASK_PAYLOAD_COIL_MULTI_CH = 0x04;

        // Register Data
        this.MASK_PAYLOAD_REGISTER_STATUS = 0x01;
        this.MASK_PAYLOAD_REGISTER_VALUE = 0x02;
        this.MASK_PAYLOAD_REGISTER_MULTI_CH = 0x04;
    }

    /**
     * 初始化 CRC 查找表
     */
    initCRCTable() {
        this.au8CRC8_Pol07_Table = [
            0x00,0x07,0x0E,0x09,0x1C,0x1B,0x12,0x15,
            0x38,0x3F,0x36,0x31,0x24,0x23,0x2A,0x2D,
            0x70,0x77,0x7E,0x79,0x6C,0x6B,0x62,0x65,
            0x48,0x4F,0x46,0x41,0x54,0x53,0x5A,0x5D,
            0xE0,0xE7,0xEE,0xE9,0xFC,0xFB,0xF2,0xF5,
            0xD8,0xDF,0xD6,0xD1,0xC4,0xC3,0xCA,0xCD,
            0x90,0x97,0x9E,0x99,0x8C,0x8B,0x82,0x85,
            0xA8,0xAF,0xA6,0xA1,0xB4,0xB3,0xBA,0xBD,
            0xC7,0xC0,0xC9,0xCE,0xDB,0xDC,0xD5,0xD2,
            0xFF,0xF8,0xF1,0xF6,0xE3,0xE4,0xED,0xEA,
            0xB7,0xB0,0xB9,0xBE,0xAB,0xAC,0xA5,0xA2,
            0x8F,0x88,0x81,0x86,0x93,0x94,0x9D,0x9A,
            0x27,0x20,0x29,0x2E,0x3B,0x3C,0x35,0x32,
            0x1F,0x18,0x11,0x16,0x03,0x04,0x0D,0x0A,
            0x57,0x50,0x59,0x5E,0x4B,0x4C,0x45,0x42,
            0x6F,0x68,0x61,0x66,0x73,0x74,0x7D,0x7A,
            0x89,0x8E,0x87,0x80,0x95,0x92,0x9B,0x9C,
            0xB1,0xB6,0xBF,0xB8,0xAD,0xAA,0xA3,0xA4,
            0xF9,0xFE,0xF7,0xF0,0xE5,0xE2,0xEB,0xEC,
            0xC1,0xC6,0xCF,0xC8,0xDD,0xDA,0xD3,0xD4,
            0x69,0x6E,0x67,0x60,0x75,0x72,0x7B,0x7C,
            0x51,0x56,0x5F,0x58,0x4D,0x4A,0x43,0x44,
            0x19,0x1E,0x17,0x10,0x05,0x02,0x0B,0x0C,
            0x21,0x26,0x2F,0x28,0x3D,0x3A,0x33,0x34,
            0x4E,0x49,0x40,0x47,0x52,0x55,0x5C,0x5B,
            0x76,0x71,0x78,0x7F,0x6A,0x6D,0x64,0x63,
            0x3E,0x39,0x30,0x37,0x22,0x25,0x2C,0x2B,
            0x06,0x01,0x08,0x0F,0x1A,0x1D,0x14,0x13,
            0xAE,0xA9,0xA0,0xA7,0xB2,0xB5,0xBC,0xBB,
            0x96,0x91,0x98,0x9F,0x8A,0x8D,0x84,0x83,
            0xDE,0xD9,0xD0,0xD7,0xC2,0xC5,0xCC,0xCB,
            0xE6,0xE1,0xE8,0xEF,0xFA,0xFD,0xF4,0xF3
        ];
    }

    /**
     * Context 操作 - 設定值 (替代 Node-RED context.set)
     * 僅使用記憶體 Map 作為儲存層
     */
    setContext(key, value) {
        this.contextStore.set(key, value);
    }

    /**
     * Context 操作 - 取得值 (替代 Node-RED context.get)
     * 僅使用記憶體 Map 作為儲存層，避免 falsy 值被誤判為 null
     */
    getContext(key) {
        return this.contextStore.has(key) ? this.contextStore.get(key) : null;
    }

    /**
     * 解析 WISE LoRa 數據
     * @param {string} hexString - 十六進制字符串
     * @param {Object} options - 可選參數
     * @param {string} options.macAddress - MAC 地址
     * @param {boolean} options.enableStorage - 是否啟用存儲 (預設: false)
     * @returns {Object} 解析結果
     */
    parse(hexString, options = {}) {
        try {
            // 初始化參數
            this.receivedString = hexString;
            this.payload_mac = options.macAddress || "";
            this.enableStorage = options.enableStorage || false;
            
            // 重置解析狀態
            this.message = {};
            this.csvMessage = '';
            this.lostPacketInfo = {};
            this.hexArr = [];
            this.arrayIndex = 0;
            this.frameControl2 = 0;
            this.totalLengthBytes = 1;

            // 基本驗證
            if (!hexString) {
                throw new Error("No data is received");
            }

            let arrLength = hexString.length;
            if (arrLength < this.MIN_FRAME_LENGTH || arrLength % 2 !== 0) {
                throw new Error("received frame length error");
            }

            // 解析十六進制字符串為數組
            arrLength = arrLength / 2;
            for (let i = 0; i < arrLength; i++) {
                this.hexArr.push(parseInt(hexString.substring(i * 2, i * 2 + 2), 16));
            }

            // 檢查幀結構版本
            this.version = (this.hexArr[0] & this.MASK_HEADER_FRAME_VERSION);

            // 檢查是否為首段 - 支援封包重組
            if (!(this.hexArr[0] & this.MASK_HEADER_FIRST_SEGMENT)) {
                // 封包重組邏輯
                const result = this.handlePacketReassembly();
                if (!result.success) {
                    return result;
                }
                this.hexArr = result.hexArr;
            } else {
                // console.log("Received First Segment.");
                this.setContext('ReceivedFirstSegment' + this.payload_mac, "");
                if (!this.checkPayloadLengthAndSetStorage(this.hexArr, null)) {
                    // console.log("Need Packet Reassemble.");
                    return { success: false, needReassemble: true };
                }
            }

            arrLength = this.hexArr.length;

            // 解析幀頭
            this.parseHeader();

            // 驗證 CRC
            this.validateCRC();

            // 解析載荷
            this.parsePayload(this.arrayIndex);

            return {
                success: true,
                data: this.message,
                csvData: this.csvMessage,
                lostPacketInfo: this.lostPacketInfo
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * 處理封包重組 (替代原始 Node-RED 封包重組邏輯)
     */
    handlePacketReassembly() {
        const payloadStorage = this.getContext('payloadStorage' + this.payload_mac) || {};

        if (payloadStorage.sequence === this.hexArr[1]) {
            console.log("Sequence number repeat. Drop this packet.");
            return {
                success: false,
                error: "Sequence number repeat. Drop this packet."
            };
        }

        if (typeof payloadStorage.sequence === 'undefined' || 
            ((payloadStorage.sequence === 255) ? 0 : (payloadStorage.sequence + 1)) !== this.hexArr[1]) {
            console.log("Sequence number error. Packet may be lost.");
            let errorMsg = "Sequence number error. Packet may be lost.";
            if (typeof this.getContext('ReceivedFirstSegment' + this.payload_mac) === "undefined") {
                errorMsg += "This is normal when deploying just began.";
            }
            return {
                success: false,
                error: errorMsg
            };
        }

        if (typeof payloadStorage.time === 'undefined' || 
            new Date().getTime() - payloadStorage.time > 60000) {
            console.log("Timeout. Drop stored packet.");
            return {
                success: false,
                error: "Timeout."
            };
        }

        const currentSeq = this.hexArr[1];
        const combinedHexArr = payloadStorage.payload.concat(this.hexArr.slice(2));

        if (!this.checkPayloadLengthAndSetStorage(combinedHexArr, currentSeq)) {
            // console.log("Need Packet Reassemble.");
            return { success: false, needReassemble: true };
        }

        return {
            success: true,
            hexArr: combinedHexArr
        };
    }

    /**
     * 檢查載荷長度並設定存儲 (替代原始 checkPayloadLengthAndSetStorage)
     */
    checkPayloadLengthAndSetStorage(hexArr, sequence) {
        let sourceAddressLen = 0;
        if ((hexArr[0] & this.MASK_HEADER_ADDRESS_MODE) === this.MASK_HEADER_ADDRESS_2_OCTECT) {
            sourceAddressLen = 2;
        } else if ((hexArr[0] & this.MASK_HEADER_ADDRESS_MODE) === this.MASK_HEADER_ADDRESS_8_OCTECT) {
            sourceAddressLen = 8;
        }

        this.frameControl2 = this.getFrameControl2Bytes(hexArr);
        this.totalLengthBytes = this.getTotalLengthBytes(hexArr);
        
        let totalLength = 0;
        if (this.frameControl2 === 1) {
            if (this.totalLengthBytes === 2) {
                totalLength = this.translateInt16(hexArr[3], hexArr[4]);
            } else {
                totalLength = hexArr[3];
            }
        } else {
            totalLength = hexArr[2];
        }

        if (hexArr.length - 1 - 1 - this.frameControl2 - this.totalLengthBytes - sourceAddressLen - 1 !== totalLength) {
            const objData = {
                sequence: sequence !== null ? sequence : hexArr[1],
                time: new Date().getTime(),
                payload: hexArr
            };

            this.setContext('payloadStorage' + this.payload_mac, objData);
            return false;
        } else {
            return true;
        }
    }

    /**
     * 解析幀頭
     */
    parseHeader() {
        // 獲取序列號
        this.message.SequenceNumber = this.hexArr[++this.arrayIndex];
        
        // 獲取 Frame Control2 位元組數
        this.frameControl2 = this.getFrameControl2Bytes(this.hexArr);
        if (this.frameControl2 == 1) {
            this.arrayIndex++;
        }
        
        this.totalLengthBytes = this.getTotalLengthBytes(this.hexArr);
        
        // 獲取載荷長度
        if (this.totalLengthBytes == 2) {
            this.message.TotalLength = this.translateInt16(this.hexArr[++this.arrayIndex], this.hexArr[++this.arrayIndex]);
        } else {
            this.message.TotalLength = this.hexArr[++this.arrayIndex];
        }

        // 檢查來源地址
        this.parseSourceAddress();
    }

    /**
     * 解析來源地址
     */
    parseSourceAddress() {
        let sourceAddress = "";

        if ((this.hexArr[0] & this.MASK_HEADER_ADDRESS_MODE) === this.MASK_HEADER_ADDRESS_NONE) {
            this.arrayIndex++;
            this.message.SourceAddress = null;
        } else if ((this.hexArr[0] & this.MASK_HEADER_ADDRESS_MODE) === this.MASK_HEADER_ADDRESS_2_OCTECT) {
            this.arrayIndex++;
            for (let i = this.arrayIndex; i < (this.arrayIndex + 2); i++) {
                sourceAddress = sourceAddress + this.addZero(this.hexArr[i].toString(16));
            }
            this.message.SourceAddress = sourceAddress;
            this.arrayIndex += 2;
        } else if ((this.hexArr[0] & this.MASK_HEADER_ADDRESS_MODE) === this.MASK_HEADER_ADDRESS_8_OCTECT) {
            this.arrayIndex++;
            for (let i = this.arrayIndex; i < (this.arrayIndex + 8); i++) {
                sourceAddress = sourceAddress + this.addZero(this.hexArr[i].toString(16));
            }
            this.message.SourceAddress = sourceAddress;
            this.arrayIndex += 8;
        }
    }

    /**
     * 驗證 CRC
     */
    validateCRC() {
        const hexPayloadArr = this.hexArr.slice(
            2 + this.frameControl2 + this.totalLengthBytes + this.getSourceAddressLength(this.message.SourceAddress),
            this.hexArr.length - 1
        );
        
        let calculateCRC = this.CrcCalc(hexPayloadArr, hexPayloadArr.length);
        if (this.version > 0) {
            calculateCRC = ~calculateCRC & 0xff;
        }

        if (calculateCRC != this.hexArr[this.hexArr.length - 1]) {
            throw new Error("Frame CRC check failed");
        }
    }

    /**
     * 解析載荷數據
     */
    parsePayload(index) {
        if (index >= this.hexArr.length - 1) {
            return;
        }

        const payloadType = this.hexArr[index] & 0xF0;

        switch (payloadType) {
            case this.PAYLOAD_DI_DATA:
                index = this.DIParse(index);
                break;
            case this.PAYLOAD_DO_DATA:
                index = this.DOParse(index);
                break;
            case this.PAYLOAD_AI_DATA:
                index = this.AIParse(index);
                break;
            case this.PAYLOAD_SENSOR_DATA:
                index = this.sensorParse(index);
                break;
            case this.PAYLOAD_DEVICE_DATA:
                index = this.deviceParse(index);
                break;
            case this.PAYLOAD_COIL_DATA:
                index = this.coilParse(index);
                break;
            case this.PAYLOAD_REGISTER_DATA:
                index = this.registerParse(index);
                break;
            case this.PAYLOAD_APP_RAW_DATA:
                index = this.appRawDataParse(index);
                break;
            default:
                throw new Error(`Unknown payload type: 0x${payloadType.toString(16)}`);
        }

        // 遞歸解析剩餘載荷
        if (index < this.hexArr.length - 1) {
            this.parsePayload(index);
        }
    }

    // 工具函數
    addZero(i) {
        i = i + "";
        if (i.length < 2) {
            i = "0" + i;
        }
        return i;
    }

    translateInt32(a, b, c, d) {
        return (d << 24) + (c << 16) + (b << 8) + a;
    }

    translateInt24(a, b, c) {
        return (c << 16) + (b << 8) + a;
    }

    translateInt16(a, b) {
        return a + (b << 8);
    }

    convertMaskToArray(number, channelCount) {
        const biArray = [];
        for (let i = 0; i < channelCount; ++i) {
            let temp = number;
            temp = temp >> i;
            biArray.push(temp & 1);
        }
        return biArray;
    }

    convertToSignedInt16(number) {
        if ((number & 0x8000) > 0) {
            number = number - 0x10000;
        }
        return number;
    }

    convertToSignedInt32(number) {
        if ((number & 0x80000000) > 0) {
            number = number - 0x100000000;
        }
        return number;
    }

    getFrameControl2Bytes(hexArr) {
        if ((hexArr[0] & this.MASK_HEADER_FRAME_CONTROL2_EXIST) >> 5 == 1) {
            return 1;
        } else {
            return 0;
        }
    }

    getTotalLengthBytes(hexArr) {
        if (this.getFrameControl2Bytes(hexArr) == 1) {
            return ((hexArr[2] & 1) == 1) ? 2 : 1;
        } else {
            return 1;
        }
    }

    getSourceAddressLength(address) {
        let addressLength = 0;
        if (address != "" && address != null) {
            addressLength = address.length / 2;
        }
        return addressLength;
    }

    CrcCalc(u8Arr, u16Length) {
        let u8CRC = 0xFF;
        for (let u16i = 0; u16i < u16Length; u16i++) {
            u8CRC = this.au8CRC8_Pol07_Table[u8CRC ^ u8Arr[u16i]];
        }
        return u8CRC;
    }

    // DI 解析
    DIParse(index) {
        let length;
        const mode = this.hexArr[index++] & 0x0F;

        if (this.version > 0) {
            length = this.hexArr[index++];
        }

        const channel = this.hexArr[index++];
        if (this.version > 0) length -= 1;
        const channelIndex = (channel & 0xE0) >> 5;
        const channelMask = channel & 0x07;

        this.message['DI' + channelIndex] = {};

        if (channelMask & this.MASK_PAYLOAD_DI_STATUS) {
            const arrBinary = this.convertMaskToArray(this.hexArr[index++], 8);
            if (this.version > 0) length -= 1;

            this.message['DI' + channelIndex].status = {};
            this.message['DI' + channelIndex].status['Signal Logic'] = arrBinary[0];
            this.message['DI' + channelIndex].status['Start Counter'] = arrBinary[1];
            this.message['DI' + channelIndex].status['Get/Clean Counter Overflow'] = arrBinary[2];
            this.message['DI' + channelIndex].status['Get/Clean L2H Latch'] = arrBinary[4];
            this.message['DI' + channelIndex].status['Get/Clean H2L Latch'] = arrBinary[5];
        }

        this.message['DI' + channelIndex].mode = mode;

        if (channelMask & this.MASK_PAYLOAD_DI_VALUE) {
            if (mode == this.DI_MODE_FREQUENCY) {
                this.message['DI' + channelIndex].Frequency_Value = this.translateInt32(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
            } else {
                this.message['DI' + channelIndex].Counter_Value = this.translateInt32(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
            }
            if (this.version > 0) length -= 4;
        }

        if (channelMask & this.MASK_PAYLOAD_DI_EVENT) {
            this.message['DI' + channelIndex].Event = this.hexArr[index++];
            if (this.version > 0) length -= 1;
        }

        if (this.version > 0 && length > 0) {
            index += length;
        }

        return index;
    }

    // DO 解析
    DOParse(index) {
        let length;
        const mode = this.hexArr[index++] & 0x0F;

        if (this.version > 0) {
            length = this.hexArr[index++];
        }

        const channel = this.hexArr[index++];
        if (this.version > 0) length -= 1;
        const channelIndex = (channel & 0xE0) >> 5;
        const channelMask = channel & 0x07;

        this.message['DO' + channelIndex] = {};

        const modeTexts = ['DO', 'Pulse output', 'Low to High delay', 'High to Low delay', 'AI alarm drive'];
        this.message['DO' + channelIndex].Mode = modeTexts[mode] || 'Unknown';

        if (channelMask & this.MASK_PAYLOAD_DO_STATUS) {
            const status = this.convertMaskToArray(this.hexArr[index++], 8);
            if (this.version > 0) length -= 1;
            this.message['DO' + channelIndex].status = {};
            this.message['DO' + channelIndex].status['Signal Logic'] = status[0];
            this.message['DO' + channelIndex].status['Pulse Output Continue'] = status[1];
        }

        if (mode == 1) {
            this.message['DO' + channelIndex].PulsAbs = 0;
            this.message['DO' + channelIndex].PulsInc = 0;
        }

        if (channelMask & this.MASK_PAYLOAD_DO_ABSOLUTE_PULSE_OUTPUT) {
            this.message['DO' + channelIndex].PulsAbs = this.translateInt32(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            );
            if (this.version > 0) length -= 4;
        }

        if (channelMask & this.MASK_PAYLOAD_DO_INCREMENTAL_PULSE_OUTPUT) {
            this.message['DO' + channelIndex].PulsInc = this.translateInt32(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            );
            if (this.version > 0) length -= 4;
        }

        if (this.version > 0 && length > 0) {
            index += length;
        }

        return index;
    }

    // AI 解析
    AIParse(index) {
        let length;
        let range = this.hexArr[index++] & 0x0F;

        if (this.version > 0) {
            length = this.hexArr[index++];
        }

        const channel = this.hexArr[index++];
        if (this.version > 0) length -= 1;
        const channelIndex = (channel & 0xE0) >> 5;
        const channelMask = channel & 0x1F;

        this.message['AI' + channelIndex] = {};
        this.message['AI' + channelIndex].Range = range;

        if (channelMask & this.MASK_PAYLOAD_AI_STATUS) {
            const status = this.convertMaskToArray(this.hexArr[index++], 8);
            if (this.version > 0) length -= 1;
            this.message['AI' + channelIndex].status = {};
            this.message['AI' + channelIndex].status['Low Alarm'] = status[0];
            this.message['AI' + channelIndex].status['High Alarm'] = status[1];
        }

        if (channelMask & this.MASK_PAYLOAD_AI_RAW_VALUE) {
            this.message['AI' + channelIndex]['Raw Data'] = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            if (this.version > 0) length -= 2;
        }

        if (channelMask & this.MASK_PAYLOAD_AI_EVENT) {
            this.message['AI' + channelIndex].Event = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            if (this.version > 0) length -= 2;
        }

        if (channelMask & this.MASK_PAYLOAD_AI_MAX_VALUE) {
            this.message['AI' + channelIndex].MaxVal = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            if (this.version > 0) length -= 2;
        }

        if (channelMask & this.MASK_PAYLOAD_AI_MIN_VALUE) {
            this.message['AI' + channelIndex].MinVal = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            if (this.version > 0) length -= 2;
        }

        if (this.version > 0 && length > 0) {
            const mask2 = this.hexArr[index++];
            length -= 1;
            if (mask2 & this.MASK_PAYLOAD_AI_MASK2_RANGE) {
                this.message['AI' + channelIndex].Range = this.hexArr[index++];
                length -= 1;
            }
            if (length > 0) {
                index += length;
            }
        }

        return index;
    }

    // Sensor 解析 (支援完整 FFT 數據重組)
    sensorParse(index) {
        const range = this.hexArr[index] & 0x0F;
        
        if (range === this.MASK_PAYLOAD_SENSOR_TEMP_C_TYPE || 
            range === this.MASK_PAYLOAD_SENSOR_TEMP_F_TYPE ||
            range === this.MASK_PAYLOAD_SENSOR_TEMP_K_TYPE || 
            range === this.MASK_PAYLOAD_SENSOR_HUMIDITY_TYPE) {
            return this.parseTempHumiSensor(index, range);
        }
        
        if (range === this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_G || 
            range === this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_MS2) {
            return this.parseAccelerometerWithFFT(index, range);
        }
        
        // 跳過未知感測器類型
        return index + 1;
    }

    // 溫濕度感測器解析
    parseTempHumiSensor(index, range) {
        let length;

        if (this.version > 0) {
            index++;
            length = this.hexArr[index];
        }

        this.message.TempHumi = {};
        this.message.TempHumi.Range = range;
        index++;
        
        const mask = this.hexArr[index] & 0x1F;
        if (this.version > 0) length -= 1;
        index++;

        if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_STATUS) {
            this.message.TempHumi.Status = this.hexArr[index++];
            if (this.version > 0) length -= 1;
        }

        if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_EVENT) {
            this.message.TempHumi.Event = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            if (this.version > 0) length -= 2;
        }

        if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_VALUE) {
            if (range === this.MASK_PAYLOAD_SENSOR_HUMIDITY_TYPE) {
                this.message.TempHumi.SenVal = this.translateInt32(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                ) / 1000;
            } else {
                this.message.TempHumi.SenVal = this.convertToSignedInt32(this.translateInt32(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                )) / 1000;
            }
            if (this.version > 0) length -= 4;
        }

        if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_MAX_VALUE) {
            this.message.TempHumi.SenMaxVal = this.translateInt32(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            ) / 100;
            if (this.version > 0) length -= 4;
        }

        if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_MIN_VALUE) {
            this.message.TempHumi.SenMinVal = this.translateInt32(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            ) / 100;
            if (this.version > 0) length -= 4;
        }

        if (this.version > 0 && length > 0) {
            index += length;
        }

        return index;
    }

    // 支援 FFT 的加速度計解析 (完整實現)
    parseAccelerometerWithFFT(index, range) {
        let length;
        let bIsSensorEventExist = false;

        if (this.version > 0) {
            index++;
            length = this.hexArr[index];
        }

        index++;
        const axisMask = (this.hexArr[index] & 0xE0) >> 5;

        const arrAxisMask = this.convertMaskToArray(axisMask, 8);
        let intAxisMaskEnable = 0;
        arrAxisMask.forEach(function (item) {
            if (item == 1) {
                intAxisMaskEnable++;
            }
        });

        const mask = this.hexArr[index] & 0x1F;
        index++;
        const extMask = this.hexArr[index]; // extend mask

        const arrExtMask = this.convertMaskToArray(extMask, 8);
        let intExtMaskEnable = 0;
        arrExtMask.forEach(function (item) {
            if (item == 1) {
                intExtMaskEnable++;
            }
        });

        if (!(mask & this.MASK_PAYLOAD_SENSOR_EXTMASK_B)) {
            this.message.Accelerometer = {};

            // if sensor event exist
            if (mask & this.MASK_PAYLOAD_SENSOR_MASK_SENSNSOR_EVENT) {
                bIsSensorEventExist = true;
            }
            index++;

            if (axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_X_MASK) {
                this.message.Accelerometer["X-Axis"] = {};
                index = this.parseAxisData(index, bIsSensorEventExist, extMask, this.message.Accelerometer["X-Axis"], range);
            }
            if (axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_Y_MASK) {
                this.message.Accelerometer["Y-Axis"] = {};
                index = this.parseAxisData(index, bIsSensorEventExist, extMask, this.message.Accelerometer["Y-Axis"], range);
            }
            if (axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_Z_MASK) {
                this.message.Accelerometer["Z-Axis"] = {};
                index = this.parseAxisData(index, bIsSensorEventExist, extMask, this.message.Accelerometer["Z-Axis"], range);
            }

            length = length - 2 - (intAxisMaskEnable * (intExtMaskEnable * 2 + (bIsSensorEventExist ? 2 : 0))); // Length - (Axis Mask + Mask) - Extend Mask A - Axis Data
            this.message.Accelerometer.LogIndex = 0;
            if (this.version > 0 && length > 0) {
                const mask2 = this.hexArr[index++];
                length -= 1;
                if (mask2 & this.MASK_PAYLOAD_SENSOR_MASK2_LOGINDEX) {
                    this.message.Accelerometer.LogIndex = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
                    length -= 4;
                }
                if (mask2 & this.MASK_PAYLOAD_SENSOR_MASK2_TIME) {
                    this.message.Accelerometer.Time = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
                    length -= 4;
                }
                if (length > 0) {
                    index += length;
                }
            }
        } else { 
            // extend mask B - FFT 數據處理
            index++;
            index = this.parseFFTData(index, extMask, axisMask, intAxisMaskEnable, length);
        }

        return index;
    }

    /**
     * 解析軸數據 (從原始代碼移植)
     */
    parseAxisData(index, bIsSensorEventExist, extMask, jsonObj, range) {
        if (bIsSensorEventExist) {
            jsonObj.SenEvent = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_VELOCITY) {
            jsonObj.OAVelocity = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100;
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_PEAK) {
            if (range === this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_G) {
                jsonObj.Peak = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 1000;
            } else {
                jsonObj.Peak = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100;
            }
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_RMS) {
            if (range === this.MASK_PAYLOAD_SENSOR_ACCELERATOR_TYPE_G) {
                jsonObj.RMS = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 1000;
            } else {
                jsonObj.RMS = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100;
            }
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_KURTOSIS) {
            jsonObj.Kurtosis = this.convertToSignedInt16(this.translateInt16(this.hexArr[index++], this.hexArr[index++])) / 100;
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_CRESTFACTOR) {
            jsonObj.CrestFactor = this.convertToSignedInt16(this.translateInt16(this.hexArr[index++], this.hexArr[index++])) / 100;
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_SKEWNESS) {
            jsonObj.Skewness = this.convertToSignedInt16(this.translateInt16(this.hexArr[index++], this.hexArr[index++])) / 100;
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_STDDEVIATION) {
            jsonObj.Deviation = this.convertToSignedInt16(this.translateInt16(this.hexArr[index++], this.hexArr[index++])) / 100;
        }
        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_DISPLACEMENT) {
            jsonObj['Peak-to-Peak Displacement'] = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
        }

        return index;
    }

    /**
     * 解析 FFT 數據 (完整實現 - 替代原始 Node-RED FFT 處理)
     */
    parseFFTData(index, extMask, axisMask, intAxisMaskEnable, length) {
        let bytesPerSample, samplesPerAxis, bytesPerAxis;

        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_INFO) {
            const dataType = this.hexArr[index++];
            const sampleRate = this.translateInt24(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            const points = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
            const logIndex = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            const timestamp = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            const totalLength = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            const massType = dataType & this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_MASSIVE_TYPE;
            bytesPerSample = (((dataType & this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_BYTES_PER_SAMPLE) >> 4) > 0) ? 4 : 2;
            samplesPerAxis = (massType == this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_MASSIVE_TYPE_FFT && ((dataType & this.MASK_PAYLOAD_SENSOR_MASSIVE_DATA_TYPE_SAMPLE_PER_AXIS) >> 2) > 0) ? (points / 2.56 / 2) : (points / 2.56);
            bytesPerAxis = bytesPerSample * samplesPerAxis;

            // length = length - Massive Info
            length = length - 18;

            const objData = {
                timestamp: timestamp,
                lastSeq: this.hexArr[1],
                lastPayload: this.hexArr,
                logIndex: logIndex,
                sampleRate: sampleRate,
                points: points,
                bytesPerSample: bytesPerSample,
                samplesPerAxis: samplesPerAxis,
                bytesPerAxis: bytesPerAxis,
                totalLength: totalLength
            };
            this.setContext('FFTDataStorage' + this.payload_mac, objData);
        }

        if (extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_SEC) {
            const FFTDataStorage = this.getContext('FFTDataStorage' + this.payload_mac) || {};
            if (typeof FFTDataStorage.timestamp == 'undefined') {
                throw new Error("FFT Data lost first packet.");
            }

            let axisType = ['X', 'Y', 'Z'];
            if (!(axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_X_MASK)) {
                const axisIndex = axisType.indexOf('X');
                if (axisIndex > -1) {
                    axisType.splice(axisIndex, 1);
                }
            }
            if (!(axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_Y_MASK)) {
                const axisIndex = axisType.indexOf('Y');
                if (axisIndex > -1) {
                    axisType.splice(axisIndex, 1);
                }
            }
            if (!(axisMask & this.MASK_PAYLOAD_SENSOR_AXIS_Z_MASK)) {
                const axisIndex = axisType.indexOf('Z');
                if (axisIndex > -1) {
                    axisType.splice(axisIndex, 1);
                }
            }

            const initialLogIndex = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            const initialOffset = this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
            let offset = initialOffset;
            // length = length - (Axis Mask + Mask + Extend Mask + Log Index + Offset)
            length = length - 10;

            this.message.FFT = {};
            if (!(extMask & this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_INFO)) {
                if (FFTDataStorage.lastSeq === this.hexArr[1]) {
                    throw new Error("Packet of FFT Data duplicated.");
                }

                if ((FFTDataStorage.lastSeq + 1) !== this.hexArr[1]) { // lost packet
                    const lastPayload = FFTDataStorage.lastPayload;
                    let lastOffset;
                    if (lastPayload[6] & this.MASK_PAYLOAD_SENSOR_EXTMASK_MASSIVE_DATA_INFO) {
                        lastOffset = this.translateInt32(lastPayload[29], lastPayload[30], lastPayload[31], lastPayload[32]) + lastPayload[4] - 28;
                    } else {
                        lastOffset = this.translateInt32(lastPayload[11], lastPayload[12], lastPayload[13], lastPayload[14]) + lastPayload[4] - 10;
                    }

                    if (initialLogIndex != FFTDataStorage.logIndex) { // previous FFT Data lost packet and next FFT Data lost first packet
                        const fillLength = (FFTDataStorage.bytesPerAxis * intAxisMaskEnable - 1) - lastOffset;
                        const logIndex = FFTDataStorage.logIndex;

                        const objData = {
                            LOG_INDEX: logIndex,
                            BYTE_OFFSET: lastOffset,
                            LENGTH: fillLength
                        };
                        this.setContext('LostPacketInfo' + this.payload_mac, objData);

                        const emptyData = {};
                        this.setContext('FFTDataStorage' + this.payload_mac, emptyData);

                        throw new Error("FFT Data lost first packet.");
                    }

                    const fillLength = offset - lastOffset;
                    const logIndex = FFTDataStorage.logIndex;

                    this.lostPacketInfo.LOG_INDEX = logIndex;
                    this.lostPacketInfo.BYTE_OFFSET = lastOffset;
                    this.lostPacketInfo.LENGTH = fillLength;
                }
            }

            const timestamp = FFTDataStorage.timestamp;
            const logIndex = FFTDataStorage.logIndex;
            const sampleRate = FFTDataStorage.sampleRate;
            const points = FFTDataStorage.points;
            bytesPerSample = FFTDataStorage.bytesPerSample;
            samplesPerAxis = FFTDataStorage.samplesPerAxis;
            bytesPerAxis = FFTDataStorage.bytesPerAxis;
            const totalLength = FFTDataStorage.totalLength;
            
            if (typeof logIndex !== "undefined")
                this.message.FFT.LOG_INDEX = logIndex;
            else
                this.message.FFT.LOG_INDEX = initialLogIndex;
            if (typeof timestamp !== "undefined")
                this.message.FFT.TIME = timestamp;
            if (typeof sampleRate !== "undefined")
                this.message.FFT.SAMPLING_RATE = sampleRate;
            if (typeof points !== "undefined")
                this.message.FFT.NUMBER_OF_SAMPLES = points;
            this.message.FFT.START_BYTE_OFFSET = offset;
            
            let axisData = {};
            this.csvMessage = '"TIME","AXIS_TYPE","DATA","LOG_INDEX","BYTE_OFFSET","SAMPLE_FREQ"\n';
            
            if (typeof bytesPerSample !== "undefined") {
                for (let i = 0; i < length / bytesPerSample; i++) {
                    const axis = offset < bytesPerAxis ? axisType[0] : (offset < (bytesPerAxis * 2) ? axisType[1] : axisType[2]);
                    const data = (bytesPerSample == 2) ? this.translateInt16(this.hexArr[index++], this.hexArr[index++]) : this.translateInt32(this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]);
                    const sampleIndex = (offset % bytesPerAxis) / bytesPerSample; // by axis
                    // sampleFreq = sampleIndex * sampling rate / number of samples
                    const sampleFreq = sampleIndex * (sampleRate / points);

                    if (typeof axisData[axis] == 'undefined') {
                        axisData[axis] = {};
                        axisData[axis].AXIS_TYPE = axis;
                        axisData[axis].START_SAMPLE_INDEX = sampleIndex;
                        axisData[axis].END_SAMPLE_INDEX = (offset % bytesPerAxis) >= ((initialOffset + length) % bytesPerAxis) ? (samplesPerAxis - 1) : (((initialOffset + length) % bytesPerAxis) / bytesPerSample) - 1;
                        axisData[axis].DATA = [];
                    }
                    axisData[axis].DATA.push(data);
                    this.csvMessage += timestamp + ',' + axis + ',' + data + ',' + logIndex + ',' + offset + ',' + (Math.floor(sampleFreq * 1000) / 1000) + '\n';

                    offset += bytesPerSample;
                    if (offset >= totalLength) {
                        index = index + ((length / bytesPerSample - i - 1) * bytesPerSample);
                        break;
                    }
                }
                this.message.FFT.END_BYTE_OFFSET = offset - 1;
                this.message.FFT.AXIS_DATA = [];
                for (let i in axisData) {
                    this.message.FFT.AXIS_DATA.push(axisData[i]);
                }
                axisData = {};

                if (offset != (bytesPerAxis * intAxisMaskEnable)) {
                    FFTDataStorage.lastSeq = this.hexArr[1];
                    FFTDataStorage.lastPayload = this.hexArr;
                    this.setContext('FFTDataStorage' + this.payload_mac, FFTDataStorage);
                } else {
                    const objData = {};
                    this.setContext('FFTDataStorage' + this.payload_mac, objData);
                }
            } else {
                let data = "";
                for (let i = index; i < this.hexArr.length - 1; i++) {
                    data += this.addZero(this.hexArr[i].toString(16));
                }
                this.message.FFT.AXIS_DATA = data;
                index += length;
            }
        }

        return index;
    }

    // Device 解析
    deviceParse(index) {
        let length;
        this.message.Device = {};
        index++;
        
        if (this.version > 0) {
            length = this.hexArr[index++];
        }
        
        const mask = this.hexArr[index++];
        if (this.version > 0) length -= 1;

        if (mask & this.MASK_DEVICE_EVENT) {
            this.message.Device.Events = this.hexArr[index++];
            if (this.version > 0) length -= 1;
        }

        if (mask & this.MASK_DEVICE_POWER_SOURCE) {
            this.message.Device.PowerSrc = this.hexArr[index++];
            if (this.version > 0) length -= 1;
        }

        if (mask & this.MASK_DEVICE_BATTERY_LEVEL) {
            this.message.Device.BatteryLevel = this.hexArr[index++];
            if (this.version > 0) length -= 1;
        }

        if (mask & this.MASK_DEVICE_BATTERY_VOLTAGE) {
            this.message.Device.BatteryVolt = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 1000;
            if (this.version > 0) length -= 2;
        }

        if (mask & this.MASK_DEVICE_TIMESTAMP) {
            this.message.Device.Time = this.translateInt32(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            );
            if (this.version > 0) length -= 4;
        }

        if (mask & this.MASK_DEVICE_POSITION) {
            this.message.Device.GNSS = {};
            const latitudeStr = (this.hexArr[index] & this.MASK_DEVICE_POSITION_LATITUDE) ? "S" : "N";
            const longitudeStr = (this.hexArr[index] & this.MASK_DEVICE_POSITION_LONGITUDE) ? "W" : "E";
            index++;

            this.message.Device.GNSS.Latitude = (this.translateInt24(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            ) / 100000).toFixed(5) + ' ' + latitudeStr;
            
            this.message.Device.GNSS.Longitude = (this.translateInt24(
                this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
            ) / 100000).toFixed(5) + ' ' + longitudeStr;
            
            if (this.version > 0) length -= 7;
        }

        if (this.version > 0 && length > 0) {
            index += length;
        }

        return index;
    }

    // Coil 解析 (簡化版本)
    coilParse(index) {
        // 簡化實現，跳過複雜的多通道解析
        index++; // 跳過類型
        if (this.version > 0) {
            const length = this.hexArr[index++];
            index += length;
        } else {
            index += 5; // 跳過基本數據
        }
        return index;
    }

    // Register 解析 (簡化版本)
    registerParse(index) {
        // 簡化實現，跳過複雜的多通道解析
        index++; // 跳過類型
        if (this.version > 0) {
            const length = this.hexArr[index++];
            index += length;
        } else {
            index += 5; // 跳過基本數據
        }
        return index;
    }

    // 應用原始數據解析
    appRawDataParse(index) {
        this.message.ApplicationRawData = {
            RawData: ""
        };
        index++;

        let length;
        if (this.version > 0) {
            length = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
        } else {
            length = this.hexArr.length - index - 1; // 到 CRC 為止
        }

        for (let i = 0; i < length; i++) {
            this.message.ApplicationRawData.RawData += this.addZero(this.hexArr[index + i].toString(16));
        }

        return index + length;
    }
}

// 導出模組（瀏覽器）
if (typeof window !== 'undefined') {
    window.WiseLoRaParser = WiseLoRaParser;
}
