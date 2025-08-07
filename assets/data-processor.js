// Data Processor for WISE6610 Data Analyzer
// Handles CSV parsing, data validation, and statistical calculations

// Global data storage
let records = [];
let organizedRecords = {
  Node_Statistics: [],
  LW_Statistics: []
};

/**
 * Parse CSV text into structured records
 * @param {string} text - Raw CSV text content
 * @returns {Array} Array of parsed record objects
 */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error('Empty CSV file');
  }
  
  const headers = lines.shift().split(',').map(h => h.trim());
  console.log('CSV Headers:', headers);
  
  return lines.map((line, index) => {
    // Better CSV parsing that handles quoted fields
    const cols = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());
    
    const obj = {};
    headers.forEach((h, i) => { 
      obj[h] = cols[i] || ''; 
    });
    
    // Convert types with better error handling
    try {
      // Handle multiple date formats
      let timeStr = obj.Time || '';
      timeStr = timeStr.replace(/\//g, '-'); // Replace / with -
      
      // Try different date formats
      let timeObj = new Date(timeStr);
      if (isNaN(timeObj.getTime())) {
        // Try ISO format
        timeObj = new Date(timeStr + 'T00:00:00');
      }
      if (isNaN(timeObj.getTime())) {
        // Try parsing manually for DD/MM/YYYY or DD-MM-YYYY format
        const parts = timeStr.split(/[-\/]/);
        if (parts.length >= 3) {
          // Assume DD/MM/YYYY format
          timeObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      }
      
      if (isNaN(timeObj.getTime())) {
        throw new Error('Invalid date format: ' + obj.Time);
      }
      
      obj.Time = timeObj;
    } catch (e) {
      console.warn(`Row ${index + 2}: Invalid date format '${obj.Time}', using current time`, e);
      obj.Time = new Date(); // fallback to current date
    }
    
    // Convert numeric fields with validation
    obj.Fcnt = parseFloat(obj.Fcnt) || 0;
    obj.Cnf = obj.Cnf === 'true' || obj.Cnf === '1'; // Convert string to boolean
    obj.Freq = parseFloat(obj.Freq) || 0; // Convert frequency to number
    obj.RSSI = parseFloat(obj.RSSI) || 0;
    obj.SNR = parseFloat(obj.SNR) || 0;
    obj.Port = parseInt(obj.Port) || 0;
    
    // Validate required fields
    if (!obj.Devname || !obj.Devaddr) {
      console.warn(`Row ${index + 2}: Missing device name or address`);
    }
    
    return obj;
  }).filter(obj => obj.Devname && obj.Devaddr); // Filter out invalid records
}

/**
 * Calculate Loss Rate of each node
 * The loss rate is calculated as the percentage of lost packets over total packets for each device
 * Loss Rate = ((Final fcnt - First fcnt) - (Total Count - 1)) / (Final fcnt - First fcnt) * 100
 * Also calculates Loss Rate by each day
 * @param {Array} records - Array of parsed CSV records
 * @returns {Array} Array of node statistics with loss rates
 */
function calculateLossRate(records) {
  console.log('Calculating loss rate for', records.length, 'records');
  
  // Group records by device
  const nodeMap = {};
  records.forEach(r => {
    const key = `${r.Devname}-${r.Devaddr}`;
    if (!nodeMap[key]) nodeMap[key] = [];
    nodeMap[key].push(r);
  });

  console.log('Found', Object.keys(nodeMap).length, 'unique devices');

  const result = [];
  Object.entries(nodeMap).forEach(([key, recs]) => {
    // Sort by Time to ensure order
    recs.sort((a, b) => a.Time - b.Time);
    
    const [Devname, Devaddr] = key.split('-');
    
    // Handle frame counter rollovers and resets
    let segments = [];
    let currentSegment = [recs[0]];
    
    for (let i = 1; i < recs.length; i++) {
      const prev = recs[i-1];
      const curr = recs[i];
      
      // If frame counter goes backwards significantly, it's likely a reset
      if (curr.Fcnt < prev.Fcnt && (prev.Fcnt - curr.Fcnt) > 100) {
        segments.push(currentSegment);
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }
    segments.push(currentSegment);
    
    // Calculate loss rate for the entire period
    let totalExpected = 0;
    let totalReceived = recs.length;
    
    segments.forEach(segment => {
      if (segment.length > 1) {
        const firstFcnt = segment[0].Fcnt;
        const lastFcnt = segment[segment.length - 1].Fcnt;
        const expected = lastFcnt - firstFcnt + 1; // +1 because we count both endpoints
        totalExpected += expected;
      } else {
        totalExpected += 1; // Single packet
      }
    });
    
    const lost = Math.max(0, totalExpected - totalReceived);
    const lossRate = totalExpected > 0 ? (lost / totalExpected) * 100 : 0;
    
    console.log(`Device ${Devname}: Expected=${totalExpected}, Received=${totalReceived}, Lost=${lost}, Rate=${lossRate.toFixed(2)}%`);
    
    // Calculate daily loss rate
    const daily = {};
    recs.forEach(r => {
      const day = r.Time.toISOString().slice(0, 10);
      if (!daily[day]) daily[day] = [];
      daily[day].push(r);
    });
    
    const dailyLoss = Object.entries(daily).map(([date, dayRecs]) => {
      dayRecs.sort((a, b) => a.Time - b.Time);
      
      // Apply same segmentation logic for daily data
      let daySegments = [];
      let dayCurrentSegment = [dayRecs[0]];
      
      for (let i = 1; i < dayRecs.length; i++) {
        const prev = dayRecs[i-1];
        const curr = dayRecs[i];
        
        if (curr.Fcnt < prev.Fcnt && (prev.Fcnt - curr.Fcnt) > 100) {
          daySegments.push(dayCurrentSegment);
          dayCurrentSegment = [curr];
        } else {
          dayCurrentSegment.push(curr);
        }
      }
      daySegments.push(dayCurrentSegment);
      
      let dayExpected = 0;
      let dayReceived = dayRecs.length;
      
      daySegments.forEach(segment => {
        if (segment.length > 1) {
          const firstFcnt = segment[0].Fcnt;
          const lastFcnt = segment[segment.length - 1].Fcnt;
          const expected = lastFcnt - firstFcnt + 1;
          dayExpected += expected;
        } else {
          dayExpected += 1;
        }
      });
      
      const dayLost = Math.max(0, dayExpected - dayReceived);
      const dayRate = dayExpected > 0 ? (dayLost / dayExpected) * 100 : 0;
      
      return { 
        date, 
        total: dayReceived, 
        expected: dayExpected,
        lost: dayLost, 
        lossRate: +dayRate.toFixed(2) 
      };
    });
    
    result.push({
      Devname,
      Devaddr,
      Total: totalReceived,
      Expected: totalExpected,
      Lost: lost,
      LossRate: +lossRate.toFixed(2),
      DailyLoss: dailyLoss
    });
  });

  return result;
}

/**
 * Calculate how many nodes' loss rate is above a certain threshold
 * @param {Array} records - Array of node statistics
 * @param {number} threshold - Loss rate threshold percentage
 * @returns {Array} Array of daily threshold statistics
 */
function calculateThresholdStats(records, threshold) {
  const dateMap = {};
  
  // Group by date from DailyLoss data
  records.forEach(nodeRecord => {
    if (nodeRecord.DailyLoss && nodeRecord.DailyLoss.length > 0) {
      nodeRecord.DailyLoss.forEach(dailyData => {
        const date = dailyData.date;
        if (!dateMap[date]) {
          dateMap[date] = {
            date: date,
            normalcnt: 0,
            abnormalcnt: 0,
            normal: [],
            abnormal: []
          };
        }
        
        if (dailyData.lossRate > threshold) {
          dateMap[date].abnormalcnt++;
          dateMap[date].abnormal.push(nodeRecord.Devname);
        } else {
          dateMap[date].normalcnt++;
          dateMap[date].normal.push(nodeRecord.Devname);
        }
      });
    }
  });
  
  // Convert to array
  return Object.values(dateMap);
}

/**
 * Group records by date string YYYY-MM-DD
 * @param {Array} recs - Array of records to group
 * @returns {Object} Object with date strings as keys
 */
function groupByDate(recs) {
  const map = {};
  recs.forEach(r => {
    // Check if this is a statistics record (has date property) or a raw record (has Time property)
    const dateStr = r.date || (r.Time ? r.Time.toISOString().slice(0,10) : null);
    if (dateStr) {
      map[dateStr] = map[dateStr] || [];
      map[dateStr].push(r);
    }
  });
  return map;
}

/**
 * Get Node Statistics for a specific date
 * @param {string} selectedDate - Date string in YYYY-MM-DD format
 * @returns {Array} Array of node statistics for the specified date
 */
function getDateNodeStatistics(selectedDate) {
  const dateNodeStats = [];
  
  organizedRecords.Node_Statistics.forEach(nodeStats => {
    // Find the daily loss data for the selected date
    const dailyData = nodeStats.DailyLoss.find(daily => daily.date === selectedDate);
    if (dailyData) {
      // Create a node stats object for this specific date
      const dateSpecificStats = {
        Devname: nodeStats.Devname,
        Devaddr: nodeStats.Devaddr,
        Total: dailyData.total,
        Expected: dailyData.expected || dailyData.total, // fallback for older data
        Lost: dailyData.lost,
        LossRate: dailyData.lossRate
      };
      dateNodeStats.push(dateSpecificStats);
    }
  });
  
  return dateNodeStats;
}

/**
 * Process CSV file and update global data structures
 * @param {File} file - CSV file to process
 * @param {number} threshold - Loss rate threshold
 * @returns {Promise} Promise that resolves when processing is complete
 */
function processCSVFile(file, threshold) {
  return new Promise((resolve, reject) => {
    console.log('Loading file:', file.name, 'Size:', file.size, 'bytes');
    
    const reader = new FileReader();
    reader.onload = () => {
      try {
        console.log('Parsing CSV...');
        records = parseCSV(reader.result);
        console.log('Parsed', records.length, 'records');
        console.log('Sample record:', records[0]);
        
        console.log('Calculating loss rates...');
        organizedRecords.Node_Statistics = calculateLossRate(records);
        console.log('Node Statistics:', organizedRecords.Node_Statistics);
        
        console.log('Calculating threshold statistics with threshold:', threshold);
        organizedRecords.LW_Statistics = calculateThresholdStats(organizedRecords.Node_Statistics, threshold);
        console.log('LW Statistics:', organizedRecords.LW_Statistics);
        
        resolve({
          records,
          organizedRecords,
          nodeStats: organizedRecords.Node_Statistics,
          thresholdStats: organizedRecords.LW_Statistics
        });
      } catch (error) {
        console.error('Error processing CSV file:', error);
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Update threshold statistics when threshold changes
 * @param {number} threshold - New threshold value
 * @returns {Object} Updated statistics and grouped data
 */
function updateThreshold(threshold) {
  if (!organizedRecords.Node_Statistics.length) return null;
  
  organizedRecords.LW_Statistics = calculateThresholdStats(organizedRecords.Node_Statistics, threshold);
  console.log('Updated LW Statistics:', organizedRecords.LW_Statistics);
  
  const byDate = groupByDate(organizedRecords.LW_Statistics);
  
  return {
    thresholdStats: organizedRecords.LW_Statistics,
    byDate
  };
}
