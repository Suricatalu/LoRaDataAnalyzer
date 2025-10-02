////////////////////////////////////////////////////////////////////////////////
// Advantech
//
// Frame Data Parser for EVA Lora modules - API Version
//
// version: 1.0.1 <2024/12/26>
// API version: 1.0.0 <2025/08/27>
//
////////////////////////////////////////////////////////////////////////////////

/**
 * EVA LoRa 數據解析器 API
 * 支援 EVA-2210、EVA-2213、EVA-2310、EVA-2311、EVA-2510、EVA-2511 等設備
 */
class EvaLoRaParser {
    constructor() {
        this.initConstants();
    }

    /**
     * 初始化常數
     */
    initConstants() {
        // Frame length
        this.MIN_FRAME_LENGTH = 4;
        this.MAX_FRAME_LENGTH = 22;

        // fPort
        this.DATA_REPORT_REPORT_DATA_CMD = 0x06;
        this.DATA_REPORT_REPORT_CONFIGURATION = 0x07;
        this.DATA_REPORT_GLOBAL_CALIBRATE_CMD = 0x0E;

        // Cmd Id
        this.CMD_ID_CONFIG_REPORT_RSP = {
            name: "ConfigReportRsp",
            value: 0x81
        };
        this.CMD_ID_READ_CONFIG_REPORT_RSP = {
            name: "ReadConfigReportRsp",
            value: 0x82
        };
        this.CMD_ID_SET_GLOBAL_CALIBRATE_RSP = {
            name: "SetGlobalCalibrateRsp",
            value: 0x81
        };
        this.CMD_ID_GET_GLOBAL_CALIBRATE_RSP = {
            name: "GetGlobalCalibrateRsp",
            value: 0x82
        };
        this.CMD_ID_CLEAR_GLOBAL_CALIBRATE_RSP = {
            name: "ClearGlobalCalibrateRsp",
            value: 0x83
        };

        // Device Type
        this.DEVICE_TYPE_EVA221X = {
            name: "EVA-2210|EVA-2213",
            value: 0x4A
        };
        this.DEVICE_TYPE_EVA2310 = {
            name: "EVA-2310",
            value: 0x0B
        };
        this.DEVICE_TYPE_EVA2311 = {
            name: "EVA-2311",
            value: 0x95
        };
        this.DEVICE_TYPE_EVA2510 = {
            name: "EVA-2510",
            value: 0x32
        };
        this.DEVICE_TYPE_EVA2511 = {
            name: "EVA-2511",
            value: 0x9F
        };

        // EVA221X Report Type
        this.EVA221X_Report_Type_0 = 0x00;
        this.EVA221X_Report_Type_1 = 0x01;
        this.EVA221X_Report_Type_2 = 0x02;
        this.EVA221X_Report_Type_3 = 0x03;
        this.EVA221X_Multiplier_List = {
            0: 1,
            1: 5,
            2: 10,
            3: 100
        };
        this.BATTERY_LOW_VOLTAGE = 128;
        this.BATTERY_VALUE = 127;

        // EVA2310
        this.EVA2310_Report_Type_0 = 0x00;
        this.EVA2310_Report_Type_1 = 0x01;

        // EVA2311
        this.EVA2311_Report_Type_0 = 0x00;
        this.EVA2311_Report_Type_1 = 0x01;

        // EVA2510
        this.EVA2510_Report_Type_0 = 0x00;
        this.EVA2510_Report_Type_1 = 0x01;

        // EVA2511
        this.EVA2511_Report_Type_0 = 0x00;
        this.EVA2511_Report_Type_1 = 0x01;

        this.SensorTypeList = {
            "1": "Temperature Sensor",
            "2": "Humidity Sensor"
        };
    }

    /**
     * 解析 EVA LoRa 數據
     * @param {string} hexString - 十六進制字符串
     * @param {number} fport - fPort 值
     * @returns {Object} 解析結果
     */
    parse(hexString, fport) {
        try {
            // 初始化
            this.receivedString = hexString;
            this.fport = fport;
            this.message = {};
            this.hexArr = [];
            this.arrayIndex = 0;

            // 基本驗證
            if (!hexString) {
                throw new Error("No data is received");
            }

            const arrLength = hexString.length;
            if (arrLength < this.MIN_FRAME_LENGTH || arrLength > this.MAX_FRAME_LENGTH || arrLength % 2 !== 0) {
                throw new Error("received frame length error");
            }

            // 解析十六進制字符串為數組
            const parsedLength = arrLength / 2;
            for (let i = 0; i < parsedLength; i++) {
                this.hexArr.push(parseInt(hexString.substring(i * 2, i * 2 + 2), 16));
            }

            // 根據 fPort 解析數據
            this.parseByFPort();

            return {
                success: true,
                data: this.message
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
     * 根據 fPort 解析數據
     */
    parseByFPort() {
        switch (this.fport) {
            case this.DATA_REPORT_REPORT_DATA_CMD:
                this.parseReportDataCmd();
                break;
            case this.DATA_REPORT_REPORT_CONFIGURATION:
                this.parseReportConfiguration();
                break;
            case this.DATA_REPORT_GLOBAL_CALIBRATE_CMD:
                this.parseGlobalCalibrateCmd();
                break;
            default:
                throw new Error("Unknown fPort");
        }
    }

    /**
     * 解析報告數據命令
     */
    parseReportDataCmd() {
        const version = this.hexArr[0];
        const deviceType = this.hexArr[1];
        const reportType = this.hexArr[2];
        let index = 3;

        switch (deviceType) {
            case this.DEVICE_TYPE_EVA221X.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA221X.name;
                index = this.parseEVA221X(index, reportType);
                break;
            case this.DEVICE_TYPE_EVA2310.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2310.name;
                index = this.parseEVA2310(index, reportType);
                break;
            case this.DEVICE_TYPE_EVA2311.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2311.name;
                index = this.parseEVA2311(index, reportType);
                break;
            case this.DEVICE_TYPE_EVA2510.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2510.name;
                index = this.parseEVA2510(index, reportType);
                break;
            case this.DEVICE_TYPE_EVA2511.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2511.name;
                index = this.parseEVA2511(index, reportType);
                break;
            default:
                throw new Error("Unknown DeviceType");
        }
    }

    /**
     * 解析 EVA221X 設備數據
     */
    parseEVA221X(index, reportType) {
        switch (reportType) {
            case this.EVA221X_Report_Type_0:
                this.parseVersionPacket(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++],
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
                break;
            case this.EVA221X_Report_Type_1:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Current1 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                this.message.Current2 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                this.message.Current3 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                this.message.Multiplier1 = this.hexArr[index++];
                break;
            case this.EVA221X_Report_Type_2:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Multiplier2 = this.hexArr[index++];
                this.message.Multiplier3 = this.hexArr[index++];
                break;
            case this.EVA221X_Report_Type_3:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Current1 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                this.message.Current2 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                this.message.Current3 = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                const multiplier = this.hexArr[index++];
                this.message.Multiplier1 = this.EVA221X_Multiplier_List[multiplier & 3];
                this.message.Multiplier2 = this.EVA221X_Multiplier_List[(multiplier & 12) >> 2];
                this.message.Multiplier3 = this.EVA221X_Multiplier_List[(multiplier & 48) >> 4];
                break;
            default:
                throw new Error("Unknown ReportType");
        }
        return index;
    }

    /**
     * 解析 EVA2310 設備數據
     */
    parseEVA2310(index, reportType) {
        switch (reportType) {
            case this.EVA2310_Report_Type_0:
                this.parseVersionPacket(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++],
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
                break;
            case this.EVA2310_Report_Type_1:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Temperature = (this.convertToSignedInt16(
                    this.translateInt16(this.hexArr[index++], this.hexArr[index++])
                ) / 100) + "°C";
                this.message.Humidity = (this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100) + "%";
                break;
            default:
                throw new Error("Unknown ReportType");
        }
        return index;
    }

    /**
     * 解析 EVA2311 設備數據
     */
    parseEVA2311(index, reportType) {
        switch (reportType) {
            case this.EVA2311_Report_Type_0:
                this.parseVersionPacket(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++],
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
                break;
            case this.EVA2311_Report_Type_1:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Temperature = (this.convertToSignedInt16(
                    this.translateInt16(this.hexArr[index++], this.hexArr[index++])
                ) / 10) + "°C";
                break;
            default:
                throw new Error("Unknown ReportType");
        }
        return index;
    }

    /**
     * 解析 EVA2510 設備數據
     */
    parseEVA2510(index, reportType) {
        switch (reportType) {
            case this.EVA2510_Report_Type_0:
                this.parseVersionPacket(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++],
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
                break;
            case this.EVA2510_Report_Type_1:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.WaterLeak = (this.hexArr[index++] == 1) ? "Leak" : "NoLeak";
                break;
            default:
                throw new Error("Unknown ReportType");
        }
        return index;
    }

    /**
     * 解析 EVA2511 設備數據
     */
    parseEVA2511(index, reportType) {
        switch (reportType) {
            case this.EVA2511_Report_Type_0:
                this.parseVersionPacket(
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++],
                    this.hexArr[index++], this.hexArr[index++], this.hexArr[index++]
                );
                break;
            case this.EVA2511_Report_Type_1:
                this.message.Battery = this.parseBattery(this.hexArr[index++]);
                this.message.Status = (this.hexArr[index++] == 1) ? "On" : "Off";
                break;
            default:
                throw new Error("Unknown ReportType");
        }
        return index;
    }

    /**
     * 解析報告配置
     */
    parseReportConfiguration() {
        const cmdId = this.hexArr[0];
        const deviceType = this.hexArr[1];
        let index = 2;

        switch (deviceType) {
            case this.DEVICE_TYPE_EVA221X.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA221X.name;
                index = this.parseEVA221XConfiguration(index, cmdId);
                break;
            case this.DEVICE_TYPE_EVA2310.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2310.name;
                index = this.parseEVA2310Configuration(index, cmdId);
                break;
            case this.DEVICE_TYPE_EVA2311.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2311.name;
                index = this.parseEVA2311Configuration(index, cmdId);
                break;
            case this.DEVICE_TYPE_EVA2510.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2510.name;
                index = this.parseEVA2510Configuration(index, cmdId);
                break;
            case this.DEVICE_TYPE_EVA2511.value:
                this.message.DeviceType = this.DEVICE_TYPE_EVA2511.name;
                index = this.parseEVA2511Configuration(index, cmdId);
                break;
            default:
                throw new Error("Unknown DeviceType");
        }
    }

    /**
     * 解析 EVA221X 配置
     */
    parseEVA221XConfiguration(index, cmdId) {
        switch (cmdId) {
            case this.CMD_ID_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_CONFIG_REPORT_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_READ_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_READ_CONFIG_REPORT_RSP.name;
                this.message.MinTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.MaxTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.CurrentChange = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "mA";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
        return index;
    }

    /**
     * 解析 EVA2310 配置
     */
    parseEVA2310Configuration(index, cmdId) {
        switch (cmdId) {
            case this.CMD_ID_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_CONFIG_REPORT_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_READ_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_READ_CONFIG_REPORT_RSP.name;
                this.message.MinTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.MaxTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.BatteryChange = (this.hexArr[index++] / 10) + "V";
                this.message.TemperatureChange = (this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100) + "°C";
                this.message.HumidityChange = (this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 100) + "%";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
        return index;
    }

    /**
     * 解析 EVA2311 配置
     */
    parseEVA2311Configuration(index, cmdId) {
        switch (cmdId) {
            case this.CMD_ID_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_CONFIG_REPORT_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_READ_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_READ_CONFIG_REPORT_RSP.name;
                this.message.MinTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.MaxTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.BatteryChange = (this.hexArr[index++] / 10) + "V";
                this.message.TemperatureChange = (this.translateInt16(this.hexArr[index++], this.hexArr[index++]) / 10) + "°C";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
        return index;
    }

    /**
     * 解析 EVA2510 配置
     */
    parseEVA2510Configuration(index, cmdId) {
        switch (cmdId) {
            case this.CMD_ID_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_CONFIG_REPORT_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_READ_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_READ_CONFIG_REPORT_RSP.name;
                this.message.MinTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.MaxTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.BatteryChange = (this.hexArr[index++] / 10) + "V";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
        return index;
    }

    /**
     * 解析 EVA2511 配置
     */
    parseEVA2511Configuration(index, cmdId) {
        switch (cmdId) {
            case this.CMD_ID_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_CONFIG_REPORT_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_READ_CONFIG_REPORT_RSP.value:
                this.message.Cmd = this.CMD_ID_READ_CONFIG_REPORT_RSP.name;
                this.message.MinTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.MaxTime = this.translateInt16(this.hexArr[index++], this.hexArr[index++]) + "s";
                this.message.BatteryChange = (this.hexArr[index++] / 10) + "V";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
        return index;
    }

    /**
     * 解析全局校準命令
     */
    parseGlobalCalibrateCmd() {
        const cmdId = this.hexArr[0];
        let index = 1;

        switch (cmdId) {
            case this.CMD_ID_SET_GLOBAL_CALIBRATE_RSP.value:
                this.message.Cmd = this.CMD_ID_SET_GLOBAL_CALIBRATE_RSP.name;
                this.message.SensorType = this.SensorTypeList[this.hexArr[index++]];
                this.message.Channel = this.hexArr[index++] + 1;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            case this.CMD_ID_GET_GLOBAL_CALIBRATE_RSP.value:
                this.message.Cmd = this.CMD_ID_GET_GLOBAL_CALIBRATE_RSP.name;
                this.message.SensorType = this.SensorTypeList[this.hexArr[index++]];
                this.message.Channel = this.hexArr[index++] + 1;
                this.message.Multiplier = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
                this.message.Divisor = this.translateInt16(this.hexArr[index++], this.hexArr[index++]);
                this.message.DeltValue = this.convertToSignedInt16(
                    this.translateInt16(this.hexArr[index++], this.hexArr[index++])
                );
                break;
            case this.CMD_ID_CLEAR_GLOBAL_CALIBRATE_RSP.value:
                this.message.Cmd = this.CMD_ID_CLEAR_GLOBAL_CALIBRATE_RSP.name;
                this.message.Status = (this.hexArr[index++] == 0) ? "Success" : "Fail";
                break;
            default:
                throw new Error("Unknown Cmd");
        }
    }

    // 工具函數
    convertDecToHex(number) {
        return this.addZero(number.toString(16).toUpperCase());
    }

    addZero(i) {
        i = i + "";
        if (i.length < 2) {
            i = "0" + i;
        }
        return i;
    }

    translateInt16(a, b) {
        return (a << 8) + b;
    }

    convertToSignedInt16(number) {
        if ((number & 0x8000) > 0) {
            number = number - 0x10000;
        }
        return number;
    }

    parseVersionPacket(sw, hw, fw1, fw2, fw3, fw4) {
        this.message.SoftwareVersion = sw / 10;
        this.message.HardwareVersion = hw;
        this.message.FirmwareVersion = this.convertDecToHex(fw1) + 
                                     this.convertDecToHex(fw2) + 
                                     this.convertDecToHex(fw3) + 
                                     this.convertDecToHex(fw4);
    }

    parseBattery(value) {
        let low_battery = "";
        if (value & this.BATTERY_LOW_VOLTAGE) {
            low_battery = "(low battery)";
        }
        return ((value & this.BATTERY_VALUE) / 10) + "V" + low_battery;
    }
}

// 導出模組（瀏覽器）
if (typeof window !== 'undefined') {
    window.EvaLoRaParser = EvaLoRaParser;
}
