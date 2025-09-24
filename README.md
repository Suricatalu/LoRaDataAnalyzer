# LoRa Data Parser and WISE6610 Multi-Node Data Analyzer

This project provides a front-end data analyzer that runs in the browser to parse CSV files and produce multi-node statistics and visualizations.

## Front-end Analyzer (Browser)

Key capabilities:
- New analytics container (perNode / global / threshold / meta).
- Rule-based classification mapped to normal/abnormal/exception.
- FCnt Reset: any decrease in FCnt is treated as a reboot and a new segment is started.
- Multi-level statistics: node overview, node daily, and global daily.
- Duplicate and gap indicators (gap detection is optional).
- Day boundary by timezone and time-window filtering; quality statistics are uplink only.

## Project Structure

```
WISE6610DataAnalyzer_Front/
├── index.html
├── parser-test.html
├── test-parser.js
├── API_USAGE.md
├── package.json
├── README.md
├── LICENSE
├── doc/
│   └── Analysis.md
└── assets/
    ├── lora-data-parser.js
    ├── wise-parser-api.js
    ├── eva-parser-api.js
    ├── app-controller.js
    ├── data-processor-raw.js
    ├── data-processor-analytics.js
    ├── data-processor.js   # legacy
    ├── chart-manager.js
    ├── table-manager.js
    ├── style.css
    └── data-parser-wise.js / data-parser-eva.js
```

## CSV Import Fields (excerpt)

| CSV Field | Internal Field | Description |
|-----------|----------------|-------------|
| Received | Time | Convert to Date (`YYYY-MM-DD HH:mm:ss`), with configurable timezone parsing |
| Device Name | Devname | Required; rows missing this are dropped |
| Type | FrameType | Parsed as `{ isUp, confirmed }` |
| DevAddr | Devaddr | Required; rows missing this are dropped |
| MAC | Mac | Split by newline/semicolon/comma into string[] |
| U/L RSSI | RSSI | number; invalid → null, excluded from averages |
| U/L SNR | SNR | number; invalid → null, excluded from averages |
| FCnt | Fcnt | number; invalid → null |
| Datarate | Datarate | Original string |
| ACK | ACK | LoRaWAN ACK bit |
| Port | Port | number; invalid → null |
| Frequency | Freq | number; invalid → null |

For the complete list of fields and specifications, see `doc/Analysis.md`.

## Usage Flow (Front-end Analyzer)

1. Upload or paste a CSV file (with header row).
2. Normalize: `data-processor-raw.js` produces `RawRecord[]`.
3. Analyze: `data-processor-analytics.js` produces `analytics`.
4. Rule-based classification: apply `meta.classification.rules` and output the three-way categorized views.
5. Render: `chart-manager.js` and `table-manager.js` re-draw based on the latest analytics.

Optional: adjust timezone and time window; `meta.filterWindow.excluded` records the number of rows excluded.

## Docs and Links

- Front-end analyzer spec: `doc/Analysis.md`
- Original project: https://github.com/Suricatalu/LoRaDataAnalyzer
- Project demo: https://suricatalu.github.io/LoRaDataAnalyzer

## License and Contributions

- License: see `LICENSE`.
- Contributions are welcome via Issues / PRs.

## Changelog (excerpt)

- v2.1.0: Added parser APIs, provided browser and Node.js support and test tools.
- v2.0.0: Adopted Solution B (analytics refactor); added rule-based classification and FCnt Reset policy; split Raw/Analytics.
