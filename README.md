# WISE6610 Data Analyzer

A comprehensive data analysis tool specifically designed for WISE-6610 LoRaWAN devices, providing CSV data parsing, packet loss rate analysis, and interactive visualization charts.

##  Features

-  **Interactive Chart Visualization**: Clear packet loss statistics charts powered by Chart.js
-  **Statistical Data Analysis**: Calculate packet loss rates and daily statistics for each node
-  **Adjustable Threshold Filtering**: Dynamically adjust loss rate thresholds to filter abnormal nodes
-  **Detailed Data Tables**: Sortable and searchable data tables using DataTables

##  How to Use

1. **Upload CSV File**: Click the file selection button to choose a CSV file containing WISE-6610 data
2. **Set Threshold**: Adjust the loss rate threshold to filter normal/abnormal nodes
3. **View Charts**: Click on chart bars to view detailed data for specific dates or categories
4. **Browse Tables**: View detailed node statistics in the table below

##  CSV File Format

The input CSV file should contain the following columns:

| Column Name | Description | Example |
|-------------|-------------|---------|
| `Devname` | Device name | WISE-6610 |
| `Devaddr` | Device address | 12345678 |
| `Time` | Timestamp | 2024-01-01 10:30:00 |
| `Fcnt` | Frame counter | 123 |
| `Cnf` | Confirmation flag | true/false |
| `Freq` | Frequency | 923.2 |
| `RSSI` | Received Signal Strength Indicator | -85 |
| `SNR` | Signal-to-Noise Ratio | 7.5 |
| `Port` | Communication port | 1 |

### Sample CSV Format:
```csv
Time,Devname,Devaddr,Fcnt,Cnf,Freq,RSSI,SNR,Port,Data
2025/5/30 0:6:57,FF994ED3,80_2A1F_MAU109,158,true,922.200000,-79,11.0,1,819E40500807000000533B00005429E21700004808FA016601220100001B044601E700410100005A02E0009F00150103000000002286386860091B00027A0D2386386843
2025/5/30 0:8:34,FF7A1BEA,Adv_1,1626,true,922.200000,-83,13.8,1,815958500807000000744000005441E2FF0000070005000400C9FFC702F7FF0000020000000600040003000D001103050000000200000008000500040014008303FDFF0000030003000000008886386860091B0002CC0D89863868C9
```

##  Project Structure

```
WISE6610DataAnalyzer_Front/
│
├── index.html              # Main HTML file
├── README.md               # Project documentation
├── LICENSE                 # MIT License
│
└── assets/                 # Asset files directory
    ├── app-controller.js   # Main controller, coordinates modules
    ├── data-processor.js   # CSV parsing and data processing
    ├── chart-manager.js    # Chart.js chart management
    ├── table-manager.js    # DataTables table management
    └── style.css          # CSS stylesheet
```

## Modular Design
The project adopts a modular architecture with four main modules:

1. **App Controller** (`app-controller.js`)
   - Orchestrates application initialization
   - Handles file upload and threshold change events
   - Coordinates interaction between modules

2. **Data Processor** (`data-processor.js`)
   - CSV file parsing and validation
   - Packet loss rate calculation algorithms
   - Data grouping and statistical functions

3. **Chart Manager** (`chart-manager.js`)
   - Chart.js chart initialization and updates
   - Chart interaction event handling
   - Responsive chart adjustments

4. **Table Manager** (`table-manager.js`)
   - DataTables initialization and configuration
   - Dynamic table header updates
   - Table data filtering and sorting

## Packet Loss Rate Calculation Logic

The system uses the following algorithm to calculate packet loss rates:

```
Loss Rate = ((Final Fcnt - Initial Fcnt) - (Actual Received Packets - 1)) / (Final Fcnt - Initial Fcnt) × 100%
```

### Special Handling Mechanisms:
- **Fcnt Reset Detection**: Automatically identifies frame counter reset situations
- **Segmented Calculation**: For long-term data, calculates in segments to improve accuracy
- **Daily Statistics**: Simultaneously calculates daily loss rate distributions

##  Use Cases

- **LoRaWAN Network Monitoring**: Monitor communication quality of WISE-6610 devices
- **Signal Quality Analysis**: Analyze packet loss patterns across different time periods
- **Network Performance Evaluation**: Assess LoRaWAN network coverage and stability
- **Fault Diagnosis**: Quickly identify problematic nodes and abnormal time periods

## Contributing

We welcome Issues and Pull Requests to help improve this project!

## Changelog

### v1.0.0 (2025-08-07)
- Initial release
- Basic CSV data parsing functionality
- Packet loss rate calculation and visualization
- Responsive web design
- DataTables integration
- Compatible with WISE-6610 V2 (Version: 1.1.5)

**Note**: Please ensure your uploaded CSV file follows the specified format for optimal analysis results.