// We'll fetch data from the API instead of hardcoding it
let allEndpointData = [];
let filteredData = [];

// We'll store these as global variables that get updated when we fetch data
let sortedData = [];
let totalEndpoints = 0;
let totalVisits = 0;

// Chart instance
let myChart;


// Function to get chart colors based on current theme
function getChartColors() {
  var style = window.getComputedStyle(document.body)

  const colours = {
    textColor: style.getPropertyValue('--md-sys-color-on-surface') ,
    primaryColor:  style.getPropertyValue('--md-sys-color-primary'),
    backgroundColor: style.getPropertyValue('--md-sys-color-background'),
    gridColor: style.getPropertyValue('--md-sys-color-on-surface'),
    tooltipBgColor: style.getPropertyValue('--md-sys-color-inverse-on-surface'),
    tooltipTextColor: style.getPropertyValue('--md-sys-color-inverse-surface')
  }
  return colours;
}

// Watch for theme changes and update chart if needed
function setupThemeChangeListener() {

  // Start observing theme changes
  document.addEventListener("modeChanged", (event) => {
    setTimeout(function() {
    if (myChart) {
      const currentLimit = document.getElementById('currentlyShowing').textContent;
      const limit = (currentLimit === endpointStatsTranslations.all)
        ? filteredData.length
        : (currentLimit === endpointStatsTranslations.top20 ? 20 : 10);
      updateChart(limit);
    }
  }, 100);
  });

  // Also watch for system preference changes
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (myChart) {
        const currentLimit = document.getElementById('currentlyShowing').textContent;
        const limit = (currentLimit === endpointStatsTranslations.all)
          ? filteredData.length
          : (currentLimit === endpointStatsTranslations.top20 ? 20 : 10);
        updateChart(limit);
      }
    });
}

// Function to filter data based on checkbox settings
function filterData() {
  const includeHome = document.getElementById('hideHomeCheckbox').checked;
  const includeLogin = document.getElementById('hideLoginCheckbox').checked;

  filteredData = allEndpointData.filter(item => {
    if (!includeHome && item.endpoint === '/') return false;
    if (!includeLogin && item.endpoint === '/login') return false;
    return true;
  });

  // Sort and calculate
  sortedData = [...filteredData].sort((a, b) => b.count - a.count);
  totalEndpoints = filteredData.length;
  totalVisits = filteredData.reduce((sum, item) => sum + item.count, 0);

  // Update stats
  document.getElementById('totalEndpoints').textContent = totalEndpoints.toLocaleString();
  document.getElementById('totalVisits').textContent = totalVisits.toLocaleString();

  // Update the chart with current limit
  const currentLimit = document.getElementById('currentlyShowing').textContent;
  const limit = (currentLimit === endpointStatsTranslations.all)
    ? filteredData.length
    : (currentLimit === endpointStatsTranslations.top20 ? 20 : 10);
  updateChart(limit);
}

// Function to fetch data from the API
async function fetchEndpointData() {
  try {
    // Show loading state
    const chartContainer = document.querySelector('.chart-container');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">${endpointStatsTranslations.loading}</span>
      </div>`;
    chartContainer.appendChild(loadingDiv);

    // Also add animation to refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.classList.add('refreshing');
    refreshBtn.disabled = true;

    const response = await fetch('/api/v1/info/load/all');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();
    allEndpointData = data;

    // Apply filters
    filterData();

    // Remove loading state
    chartContainer.removeChild(loadingDiv);
    refreshBtn.classList.remove('refreshing');
    refreshBtn.disabled = false;

  } catch (error) {
    console.error('Error fetching endpoint data:', error);
    // Show error message to user
    showError(endpointStatsTranslations.failedToLoad);

    // Reset refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.classList.remove('refreshing');
    refreshBtn.disabled = false;
  }
}

// Function to format endpoint names
function formatEndpointName(endpoint) {
  if (endpoint === '/') return endpointStatsTranslations.home;
  if (endpoint === '/login') return endpointStatsTranslations.login;
  return endpoint.replace('/', '').replace(/-/g, ' ');
}

// Function to update the table
function updateTable(data) {
  const tableBody = document.getElementById('endpointTableBody');
  tableBody.innerHTML = '';

  data.forEach((item, index) => {
    const percentage = ((item.count / totalVisits) * 100).toFixed(2);
    const row = document.createElement('tr');

    // Format endpoint for better readability
    let displayEndpoint = item.endpoint;
    if (displayEndpoint.length > 40) {
      displayEndpoint = displayEndpoint.substring(0, 37) + '...';
    }

    row.innerHTML = `
      <td>${index + 1}</td>
      <td title="${item.endpoint}">${displayEndpoint}</td>
      <td>${item.count.toLocaleString()}</td>
      <td>${percentage}%</td>
    `;

    tableBody.appendChild(row);
  });
}

// Function to update the chart
function updateChart(dataLimit) {
  const chartData = sortedData.slice(0, dataLimit);

  // Calculate displayed statistics
  const displayedVisits = chartData.reduce((sum, item) => sum + item.count, 0);
  const displayedPercentage = totalVisits > 0
    ? ((displayedVisits / totalVisits) * 100).toFixed(2)
    : '0';

  document.getElementById('displayedVisits').textContent = displayedVisits.toLocaleString();
  document.getElementById('displayedPercentage').textContent = displayedPercentage;

  // If the limit equals the total filtered items, show "All"; otherwise "Top X"
  document.getElementById('currentlyShowing').textContent =
    (dataLimit === filteredData.length)
      ? endpointStatsTranslations.all
      : endpointStatsTranslations.top + dataLimit;

  // Update the table with new data
  updateTable(chartData);

  // Prepare labels and datasets
  const labels = chartData.map(item => formatEndpointName(item.endpoint));
  const data = chartData.map(item => item.count);

  // Get theme-specific colors
  const colors = getChartColors();

  // Destroy previous chart if it exists
  if (myChart) {
    myChart.destroy();
  }

  // Create chart context
  const ctx = document.getElementById('endpointChart').getContext('2d');

  // Create new chart with theme-appropriate colors
  myChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: endpointStatsTranslations.numberOfVisits,
        data: data,
        backgroundColor: colors.primaryColor.replace('rgb', 'rgba').replace(')', ', 0.6)'),
        borderColor: colors.primaryColor,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: dataLimit > 20 ? 'x' : 'y',
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: colors.primaryColor,
            font: {
              weight: 'bold'
            }
          }
        },
        tooltip: {
          backgroundColor: colors.tooltipBgColor,
          titleColor: colors.tooltipTextColor,
          bodyColor: colors.tooltipTextColor,
          borderColor: colors.tooltipBgColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleFont: {
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            size: 13
          },
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const percentage = totalVisits > 0
                ? ((value / totalVisits) * 100).toFixed(2)
                : '0';
              // Insert your i18n text in the final string:
              // e.g. "Visits: 12 (34% of total)"
              // If your translation includes placeholders, you'd parse them here:
              return endpointStatsTranslations.visitsTooltip
                .replace('{0}', value.toLocaleString())
                .replace('{1}', percentage);
            }
          }
        }
      },
      scales: {
        x: {
          border: {
            color: colors.gridColor
          },
          ticks: {
            color: colors.gridColor,
            font: {
              size: 12
            },
            callback: function(value, index, values) {
              let label = this.getLabelForValue(value);
              return label.length > 15 ? label.substr(0, 15) + '...' : label;
            }
          },
          grid: {
            color: `${colors.gridColor}`
          }
        },
        y: {
          border: {
            color: colors.gridColor
          },
          min: 0,
          ticks: {
            color: colors.gridColor,
            font: {
              size: 12
            },
            precision: 0
          },
          grid: {
            color: `${colors.gridColor}`
          }
        }
      }
    }
  });
}

// Initialize with fetch and top 10
document.addEventListener('DOMContentLoaded', function() {
  // Set up theme change listener
  setupThemeChangeListener();

  // Initial data fetch
  fetchEndpointData();

  // Set up button event listeners
  document.getElementById('top10Btn').addEventListener('click', function() {
    updateChart(10);
    setActiveButton(this);
  });

  document.getElementById('top20Btn').addEventListener('click', function() {
    updateChart(20);
    setActiveButton(this);
  });

  document.getElementById('allBtn').addEventListener('click', function() {
    updateChart(filteredData.length);
    setActiveButton(this);
  });

  document.getElementById('refreshBtn').addEventListener('click', function() {
    fetchEndpointData();
  });

  // Set up filter checkbox listeners
  document.getElementById('hideHomeCheckbox').addEventListener('change', filterData);
  document.getElementById('hideLoginCheckbox').addEventListener('change', filterData);
});

function setActiveButton(activeButton) {
  // Remove active class from all buttons
  document.querySelectorAll('.chart-controls button').forEach(button => {
    button.classList.remove('active');
  });
  // Add active class to clicked button
  activeButton.classList.add('active');
}

// Function to handle errors in a user-friendly way
function showError(message) {
  const chartContainer = document.querySelector('.chart-container');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'alert alert-danger';
  errorDiv.innerHTML = `
    <span class="material-symbols-rounded" style="vertical-align: bottom; margin-right: 5px;">error</span>
    ${message}
    <button id="errorRetryBtn" class="btn btn-outline-danger btn-sm" style="margin-left: 10px;">
      <span class="material-symbols-rounded" style="font-size: 1rem; vertical-align: bottom;">refresh</span>
      ${endpointStatsTranslations.retry}
    </button>
  `;

  chartContainer.innerHTML = '';
  chartContainer.appendChild(errorDiv);

  // Add retry button functionality
  document.getElementById('errorRetryBtn').addEventListener('click', fetchEndpointData);
}
