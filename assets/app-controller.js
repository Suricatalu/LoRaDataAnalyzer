// Main Controller for WISE6610 Data Analyzer
// Coordinates between data processing, chart, and table components

/**
 * Initialize the application
 */
function initializeApp() {
  console.log('WISE6610 Data Analyzer initializing...');
  
  // Setup event listeners
  setupEventListeners();
  
  console.log('Application initialized successfully');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Handle file input
  const csvFileInput = document.getElementById('csvFile');
  if (csvFileInput) {
    csvFileInput.addEventListener('change', handleFileChange);
  }
  
  // Handle threshold changes
  const thresholdInput = document.getElementById('threshold');
  if (thresholdInput) {
    thresholdInput.addEventListener('input', handleThresholdChange);
  }
}

/**
 * Handle CSV file selection and processing
 * @param {Event} event - File input change event
 */
async function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // Show loading state
    showLoadingState();
    
    // Get current threshold
    const threshold = parseFloat(document.getElementById('threshold').value) || 0;
    
    // Process the file using data processor
    const result = await processCSVFile(file, threshold);
    
    // Update chart
    const byDate = groupByDate(result.thresholdStats);
    renderBarChart(byDate, threshold);
    
    // Update table with node statistics
    showNodeStatistics(result.nodeStats);
    
    // Hide loading state
    hideLoadingState();
    
    console.log('File processed successfully');
    
  } catch (error) {
    console.error('Error processing CSV file:', error);
    alert('Error processing CSV file: ' + error.message + '\nPlease check the file format and try again.');
    hideLoadingState();
  }
}

/**
 * Handle threshold value changes
 */
function handleThresholdChange() {
  // Check if we have data to work with
  if (!organizedRecords || !organizedRecords.Node_Statistics || !organizedRecords.Node_Statistics.length) {
    return;
  }
  
  try {
    const threshold = parseFloat(document.getElementById('threshold').value) || 0;
    
    // Update threshold statistics
    const result = updateThreshold(threshold);
    
    if (result) {
      // Update chart with new threshold
      renderBarChart(result.byDate, threshold);
      
      console.log('Threshold updated to:', threshold);
    }
  } catch (error) {
    console.error('Error updating threshold:', error);
  }
}

/**
 * Show loading state
 */
function showLoadingState() {
  // You can customize this to show a loading spinner or message
  const csvFileInput = document.getElementById('csvFile');
  const thresholdInput = document.getElementById('threshold');
  
  if (csvFileInput) csvFileInput.disabled = true;
  if (thresholdInput) thresholdInput.disabled = true;
  
  // Could add a loading overlay or spinner here
  console.log('Loading...');
}

/**
 * Hide loading state
 */
function hideLoadingState() {
  const csvFileInput = document.getElementById('csvFile');
  const thresholdInput = document.getElementById('threshold');
  
  if (csvFileInput) csvFileInput.disabled = false;
  if (thresholdInput) thresholdInput.disabled = false;
  
  console.log('Loading complete');
}

/**
 * Handle errors globally
 * @param {Error} error - Error to handle
 * @param {string} context - Context where error occurred
 */
function handleError(error, context = 'Unknown') {
  console.error(`Error in ${context}:`, error);
  
  // You can customize error handling here
  // For example, show user-friendly messages
  const errorMessage = error.message || 'An unexpected error occurred';
  
  // Could implement toast notifications or modal dialogs
  alert(`Error: ${errorMessage}`);
}

/**
 * Utility function to check if all required modules are loaded
 * @returns {boolean} True if all modules are available
 */
function checkModulesLoaded() {
  const requiredFunctions = [
    'processCSVFile',
    'calculateLossRate', 
    'calculateThresholdStats',
    'groupByDate',
    'renderBarChart',
    'showNodeStatistics',
    'showTable'
  ];
  
  const missingFunctions = requiredFunctions.filter(fn => typeof window[fn] !== 'function');
  
  if (missingFunctions.length > 0) {
    console.error('Missing required functions:', missingFunctions);
    return false;
  }
  
  return true;
}

/**
 * Application startup
 */
document.addEventListener('DOMContentLoaded', () => {
  // Check if all modules are loaded
  if (!checkModulesLoaded()) {
    console.error('Some required modules are not loaded. Please check script loading order.');
    return;
  }
  
  // Initialize the application
  initializeApp();
});

// Make functions available globally for backward compatibility
window.handleFileChange = handleFileChange;
window.handleThresholdChange = handleThresholdChange;
