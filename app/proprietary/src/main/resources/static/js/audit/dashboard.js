// Initialize variables
let currentPage = 0;
let pageSize = 20;
let totalPages = 0;
let typeFilter = '';
let principalFilter = '';
let startDateFilter = '';
let endDateFilter = '';

// Charts
let typeChart;
let userChart;
let timeChart;

// DOM elements - will properly initialize these during page load
let auditTableBody;
let pageSizeSelect;
let typeFilterInput;
let exportTypeFilterInput;
let principalFilterInput;
let startDateFilterInput;
let endDateFilterInput;
let applyFiltersButton;
let resetFiltersButton;


// Initialize page
// Theme change listener to redraw charts when theme changes
function setupThemeChangeListener() {
    // Watch for theme changes (usually by a class on body or html element)
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'data-bs-theme' || mutation.attributeName === 'class') {
                // Redraw charts with new theme colors if they exist
                if (typeChart && userChart && timeChart) {
                    // If we have stats data cached, use it
                    if (window.cachedStatsData) {
                        renderCharts(window.cachedStatsData);
                    }
                }
            }
        });
    });

    // Observe the document element for theme changes
    observer.observe(document.documentElement, { attributes: true });

    // Also observe body for class changes
    observer.observe(document.body, { attributes: true });
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM references
    auditTableBody = document.getElementById('auditTableBody');
    pageSizeSelect = document.getElementById('pageSizeSelect');
    typeFilterInput = document.getElementById('typeFilter');
    exportTypeFilterInput = document.getElementById('exportTypeFilter');
    principalFilterInput = document.getElementById('principalFilter');
    startDateFilterInput = document.getElementById('startDateFilter');
    endDateFilterInput = document.getElementById('endDateFilter');
    applyFiltersButton = document.getElementById('applyFilters');
    resetFiltersButton = document.getElementById('resetFilters');

    // Load event types for dropdowns
    loadEventTypes();

    // Show a loading message immediately
    if (auditTableBody) {
        auditTableBody.innerHTML =
            '<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> ' + window.i18n.loading + '</td></tr>';
    }

    // Make a direct API call first to avoid validation issues
    loadAuditData(0, pageSize);

    // Load statistics for dashboard
    loadStats(7);

    // Setup theme change listener
    setupThemeChangeListener();

    // Set up event listeners
    pageSizeSelect.addEventListener('change', function() {
        pageSize = parseInt(this.value);
        window.originalPageSize = pageSize;
        currentPage = 0;
        window.requestedPage = 0;
        loadAuditData(0, pageSize);
    });

    applyFiltersButton.addEventListener('click', function() {
        typeFilter = typeFilterInput.value.trim();
        principalFilter = principalFilterInput.value.trim();
        startDateFilter = startDateFilterInput.value;
        endDateFilter = endDateFilterInput.value;
        currentPage = 0;
        window.requestedPage = 0;
        loadAuditData(0, pageSize);
    });

    resetFiltersButton.addEventListener('click', function() {
        // Reset input fields
        typeFilterInput.value = '';
        principalFilterInput.value = '';
        startDateFilterInput.value = '';
        endDateFilterInput.value = '';

        // Reset filter variables
        typeFilter = '';
        principalFilter = '';
        startDateFilter = '';
        endDateFilter = '';

        // Reset page
        currentPage = 0;
        window.requestedPage = 0;

        // Update UI
        document.getElementById('currentPage').textContent = '1';

        // Load data with reset filters
        loadAuditData(0, pageSize);
    });

    // Reset export filters button
    document.getElementById('resetExportFilters').addEventListener('click', function() {
        exportTypeFilter.value = '';
        exportPrincipalFilter.value = '';
        exportStartDateFilter.value = '';
        exportEndDateFilter.value = '';
    });

    // Make radio buttons behave like toggle buttons
    const radioLabels = document.querySelectorAll('label.btn-outline-primary');
    radioLabels.forEach(label => {
        const radio = label.querySelector('input[type="radio"]');

        if (radio) {
            // Highlight the checked radio button's label
            if (radio.checked) {
                label.classList.add('active');
            }

            // Handle clicking on the label
            label.addEventListener('click', function() {
                // Remove active class from all labels
                radioLabels.forEach(l => l.classList.remove('active'));

                // Add active class to this label
                this.classList.add('active');

                // Check this radio button
                radio.checked = true;
            });
        }
    });

    // Handle export button
    exportButton.onclick = function(e) {
        e.preventDefault();

        // Get selected format with fallback
        const selectedRadio = document.querySelector('input[name="exportFormat"]:checked');
        const exportFormat = selectedRadio ? selectedRadio.value : 'csv';
        exportAuditData(exportFormat);
        return false;
    };

    // Set up pagination buttons
    document.getElementById('page-first').onclick = function() {
        if (currentPage > 0) {
            goToPage(0);
        }
        return false;
    };

    document.getElementById('page-prev').onclick = function() {
        if (currentPage > 0) {
            goToPage(currentPage - 1);
        }
        return false;
    };

    document.getElementById('page-next').onclick = function() {
        if (currentPage < totalPages - 1) {
            goToPage(currentPage + 1);
        }
        return false;
    };

    document.getElementById('page-last').onclick = function() {
        if (totalPages > 0 && currentPage < totalPages - 1) {
            goToPage(totalPages - 1);
        }
        return false;
    };

    // Set up tab change events
    const tabEls = document.querySelectorAll('button[data-bs-toggle="tab"]');
    tabEls.forEach(tabEl => {
        tabEl.addEventListener('shown.bs.tab', function (event) {
            const targetId = event.target.getAttribute('data-bs-target');
            if (targetId === '#dashboard') {
                // Redraw charts when dashboard tab is shown
                if (typeChart) typeChart.update();
                if (userChart) userChart.update();
                if (timeChart) timeChart.update();
            }
        });
    });
});

// Load audit data from server
function loadAuditData(targetPage, realPageSize) {
    const requestedPage = targetPage !== undefined ? targetPage : window.requestedPage || 0;
    realPageSize = realPageSize || pageSize;

    showLoading('table-loading');

    // Always request page 0 from server, but with increased page size if needed
    let url = `/api/v1/audit/data?page=${requestedPage}&size=${realPageSize}`;

    if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
    if (principalFilter) url += `&principal=${encodeURIComponent(principalFilter)}`;
    if (startDateFilter) url += `&startDate=${startDateFilter}`;
    if (endDateFilter) url += `&endDate=${endDateFilter}`;

    // Update page indicator
    if (document.getElementById('page-indicator')) {
        document.getElementById('page-indicator').textContent = `Page ${requestedPage + 1} of ?`;
    }

    fetchWithCsrf(url)
        .then(response => {
            return response.json();
        })
        .then(data => {


            // Calculate the correct slice of data to show for the requested page
            let displayContent = data.content;

            // Render the correct slice of data
            renderTable(displayContent);

            // Calculate total pages based on the actual total elements
            const calculatedTotalPages = Math.ceil(data.totalElements / realPageSize);
            totalPages = calculatedTotalPages;
            currentPage = requestedPage; // Use our tracked page, not server's


            // Update UI
            document.getElementById('currentPage').textContent = currentPage + 1;
            document.getElementById('totalPages').textContent = totalPages;
            document.getElementById('totalRecords').textContent = data.totalElements;
            if (document.getElementById('page-indicator')) {
                document.getElementById('page-indicator').textContent = `Page ${currentPage + 1} of ${totalPages}`;
            }

            // Re-enable buttons with correct state
            document.getElementById('page-first').disabled = currentPage === 0;
            document.getElementById('page-prev').disabled = currentPage === 0;
            document.getElementById('page-next').disabled = currentPage >= totalPages - 1;
            document.getElementById('page-last').disabled = currentPage >= totalPages - 1;

            hideLoading('table-loading');

            // Restore original page size for next operations
            if (window.originalPageSize && realPageSize !== window.originalPageSize) {
                pageSize = window.originalPageSize;

            }

            // Store original page size for recovery
            window.originalPageSize = realPageSize;

            // Clear busy flag
            window.paginationBusy = false;

        })
        .catch(error => {

            if (auditTableBody) {
                auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center">${window.i18n.errorLoading} ${error.message}</td></tr>`;
            }
            hideLoading('table-loading');

            // Re-enable buttons
            document.getElementById('page-first').disabled = false;
            document.getElementById('page-prev').disabled = false;
            document.getElementById('page-next').disabled = false;
            document.getElementById('page-last').disabled = false;

            // Clear busy flag
            window.paginationBusy = false;
        });
}

// Load statistics for charts
function loadStats(days) {
    showLoading('type-chart-loading');
    showLoading('user-chart-loading');
    showLoading('time-chart-loading');

    fetchWithCsrf(`/api/v1/audit/stats?days=${days}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('total-events').textContent = data.totalEvents;
            // Cache stats data for theme changes
            window.cachedStatsData = data;
            renderCharts(data);
            hideLoading('type-chart-loading');
            hideLoading('user-chart-loading');
            hideLoading('time-chart-loading');
        })
        .catch(error => {
            console.error('Error loading stats:', error);
            hideLoading('type-chart-loading');
            hideLoading('user-chart-loading');
            hideLoading('time-chart-loading');
        });
}

// Export audit data
function exportAuditData(format) {
    const type = exportTypeFilter.value.trim();
    const principal = exportPrincipalFilter.value.trim();
    const startDate = exportStartDateFilter.value;
    const endDate = exportEndDateFilter.value;

    let url = format === 'json' ? '/api/v1/audit/export/json?' : '/api/v1/audit/export/csv?';

    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (principal) url += `&principal=${encodeURIComponent(principal)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    // Trigger download
    window.location.href = url;
}

// Render table with audit data
function renderTable(events) {

    if (!events || events.length === 0) {
        auditTableBody.innerHTML = '<tr><td colspan="5" class="text-center">' + window.i18n.noEventsFound + '</td></tr>';
        return;
    }

    try {
        auditTableBody.innerHTML = '';

        events.forEach((event, index) => {
            try {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${event.id || 'N/A'}</td>
                    <td>${formatDate(event.timestamp)}</td>
                    <td>${escapeHtml(event.principal || 'N/A')}</td>
                    <td>${escapeHtml(event.type || 'N/A')}</td>
                    <td><button class="btn btn-sm btn-outline-primary view-details">${window.i18n.viewDetails || 'View Details'}</button></td>
                `;

                // Store event data for modal
                row.dataset.event = JSON.stringify(event);

                // Add click handler for details button
                const detailsButton = row.querySelector('.view-details');
                if (detailsButton) {
                    detailsButton.addEventListener('click', function() {
                        showEventDetails(event);
                    });
                }

                auditTableBody.appendChild(row);
            } catch (rowError) {

            }
        });

    } catch (e) {
        auditTableBody.innerHTML = '<tr><td colspan="5" class="text-center">' + window.i18n.errorRendering + ' ' + e.message + '</td></tr>';
    }
}

// Show event details in modal
function showEventDetails(event) {
    // Get modal elements by ID with correct hyphenated IDs from HTML
    const modalId = document.getElementById('modal-id');
    const modalPrincipal = document.getElementById('modal-principal');
    const modalType = document.getElementById('modal-type');
    const modalTimestamp = document.getElementById('modal-timestamp');
    const modalData = document.getElementById('modal-data');
    const eventDetailsModal = document.getElementById('eventDetailsModal');

    // Set modal content
    if (modalId) modalId.textContent = event.id;
    if (modalPrincipal) modalPrincipal.textContent = event.principal;
    if (modalType) modalType.textContent = event.type;
    if (modalTimestamp) modalTimestamp.textContent = formatDate(event.timestamp);

    // Format JSON data
    if (modalData) {
        try {
            const dataObj = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            modalData.textContent = JSON.stringify(dataObj, null, 2);
        } catch (e) {
            modalData.textContent = event.data || 'No data available';
        }
    }

    // Show the modal
    if (eventDetailsModal) {
        const modal = new bootstrap.Modal(eventDetailsModal);
        modal.show();
    }
}

// No need for a dynamic pagination renderer anymore as we're using static buttons

// Direct pagination approach - server seems to be hard-limited to returning 20 items
function goToPage(page) {

    // Basic validation - totalPages may not be initialized on first load
    if (page < 0) {
        return;
    }

    // Skip validation against totalPages on first load
    if (totalPages > 0 && page >= totalPages) {
        return;
    }

    // Simple guard flag
    if (window.paginationBusy) {
        return;
    }
    window.paginationBusy = true;

    try {

        // Store the requested page for later
        window.requestedPage = page;
        currentPage = page;

        // Update UI immediately for user feedback
        document.getElementById('currentPage').textContent = page + 1;

        // Load data with this page
        loadAuditData(page, pageSize);
    } catch (e) {
        window.paginationBusy = false;
    }
}

// Render charts
function renderCharts(data) {
    // Get theme colors
    const colors = getThemeColors();

    // Prepare data for charts
    const typeLabels = Object.keys(data.eventsByType);
    const typeValues = Object.values(data.eventsByType);

    const userLabels = Object.keys(data.eventsByPrincipal);
    const userValues = Object.values(data.eventsByPrincipal);

    // Sort days for time chart
    const timeLabels = Object.keys(data.eventsByDay).sort();
    const timeValues = timeLabels.map(day => data.eventsByDay[day] || 0);

    // Chart.js global defaults for dark mode compatibility
    Chart.defaults.color = colors.text;
    Chart.defaults.borderColor = colors.grid;

    // Type chart
    if (typeChart) {
        typeChart.destroy();
    }

    const typeCtx = document.getElementById('typeChart').getContext('2d');
    typeChart = new Chart(typeCtx, {
        type: 'bar',
        data: {
            labels: typeLabels,
            datasets: [{
                label: window.i18n.eventsByType,
                data: typeValues,
                backgroundColor: colors.chartColors.slice(0, typeLabels.length).map(color => {
                    // Add transparency to the colors
                    if (color.startsWith('rgb(')) {
                        return color.replace('rgb(', 'rgba(').replace(')', ', 0.8)');
                    }
                    return color;
                }),
                borderColor: colors.chartColors.slice(0, typeLabels.length),
                borderWidth: 2,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        },
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        boxWidth: 12,
                        boxHeight: 12,
                    }
                },
                tooltip: {
                    titleFont: {
                        weight: 'bold',
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    backgroundColor: colors.isDarkMode ? 'rgba(40, 44, 52, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    bodyColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    borderColor: colors.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : colors.grid,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 12
                        },
                        precision: 0 // Only show whole numbers
                    },
                    grid: {
                        color: colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : colors.grid
                    },
                    title: {
                        display: true,
                        text: 'Count',
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        }
                    }
                },
                x: {
                    ticks: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 11
                        },
                        callback: function(value, index) {
                            // Get the original label
                            const label = this.getLabelForValue(value);
                            // If the label is too long, truncate it
                            const maxLength = 10;
                            if (label.length > maxLength) {
                                return label.substring(0, maxLength) + '...';
                            }
                            return label;
                        },
                        autoSkip: true,
                        maxRotation: 0,
                        minRotation: 0
                    },
                    grid: {
                        color: colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : colors.grid,
                        display: false // Hide vertical gridlines for cleaner look
                    },
                    title: {
                        display: true,
                        text: 'Event Type',
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        },
                        padding: {top: 10, bottom: 0}
                    }
                }
            }
        }
    });

    // User chart
    if (userChart) {
        userChart.destroy();
    }

    const userCtx = document.getElementById('userChart').getContext('2d');
    userChart = new Chart(userCtx, {
        type: 'pie',
        data: {
            labels: userLabels,
            datasets: [{
                label: window.i18n.eventsByUser,
                data: userValues,
                backgroundColor: colors.chartColors.slice(0, userLabels.length),
                borderWidth: 2,
                borderColor: colors.isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: colors.text,
                        font: {
                            size: colors.isDarkMode ? 14 : 12,
                            weight: colors.isDarkMode ? 'bold' : 'normal'
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 10,
                        boxHeight: 10,
                        // Add a box around each label for better contrast in dark mode
                        generateLabels: function(chart) {
                            const original = Chart.overrides.pie.plugins.legend.labels.generateLabels;
                            const labels = original.call(this, chart);

                            if (colors.isDarkMode) {
                                labels.forEach(label => {
                                    // Enhance contrast for dark mode
                                    label.fillStyle = label.fillStyle; // Keep original fill
                                    label.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // White border
                                    label.lineWidth = 2; // Thicker border
                                });
                            }

                            return labels;
                        }
                    }
                },
                tooltip: {
                    titleFont: {
                        weight: 'bold',
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    backgroundColor: colors.isDarkMode ? 'rgba(40, 44, 52, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    bodyColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    borderColor: colors.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : colors.grid,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6
                }
            }
        }
    });

    // Time chart
    if (timeChart) {
        timeChart.destroy();
    }

    const timeCtx = document.getElementById('timeChart').getContext('2d');

    // Get first color for line chart with appropriate transparency
    let bgColor, borderColor;
    if (colors.isDarkMode) {
        bgColor = 'rgba(162, 201, 255, 0.3)'; // Light blue with transparency
        borderColor = 'rgb(162, 201, 255)';   // Light blue solid
    } else {
        bgColor = 'rgba(0, 96, 170, 0.2)';   // Dark blue with transparency
        borderColor = 'rgb(0, 96, 170)';      // Dark blue solid
    }

    timeChart = new Chart(timeCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: window.i18n.eventsOverTime,
                data: timeValues,
                backgroundColor: bgColor,
                borderColor: borderColor,
                borderWidth: 3,
                tension: 0.2,
                fill: true,
                pointBackgroundColor: borderColor,
                pointBorderColor: colors.isDarkMode ? '#fff' : '#000',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        },
                        usePointStyle: true,
                        pointStyle: 'line',
                        boxWidth: 50,
                        boxHeight: 3
                    }
                },
                tooltip: {
                    titleFont: {
                        weight: 'bold',
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    backgroundColor: colors.isDarkMode ? 'rgba(40, 44, 52, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    bodyColor: colors.isDarkMode ? '#ffffff' : '#000000',
                    borderColor: colors.isDarkMode ? 'rgba(255, 255, 255, 0.5)' : colors.grid,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        label: function(context) {
                            return `Events: ${context.raw}`;
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 12
                        },
                        precision: 0 // Only show whole numbers
                    },
                    grid: {
                        color: colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : colors.grid
                    },
                    title: {
                        display: true,
                        text: 'Number of Events',
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        }
                    }
                },
                x: {
                    ticks: {
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 12
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        color: colors.isDarkMode ? 'rgba(255, 255, 255, 0.1)' : colors.grid
                    },
                    title: {
                        display: true,
                        text: 'Date',
                        color: colors.text,
                        font: {
                            weight: colors.isDarkMode ? 'bold' : 'normal',
                            size: 14
                        },
                        padding: {top: 20}
                    }
                }
            }
        }
    });
}

// Helper functions
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showLoading(id) {
    const loading = document.getElementById(id);
    if (loading) loading.style.display = 'flex';
}

function hideLoading(id) {
    const loading = document.getElementById(id);
    if (loading) loading.style.display = 'none';
}

// Load event types from the server for filter dropdowns
function loadEventTypes() {
    fetchWithCsrf('/api/v1/audit/types')
        .then(response => response.json())
        .then(types => {
            if (!types || types.length === 0) {
                return;
            }

            // Populate the type filter dropdowns
            const typeFilter = document.getElementById('typeFilter');
            const exportTypeFilter = document.getElementById('exportTypeFilter');

            // Clear existing options except the first one (All event types)
            while (typeFilter.options.length > 1) {
                typeFilter.remove(1);
            }

            while (exportTypeFilter.options.length > 1) {
                exportTypeFilter.remove(1);
            }

            // Add new options
            types.forEach(type => {
                // Main filter dropdown
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                typeFilter.appendChild(option);

                // Export filter dropdown
                const exportOption = document.createElement('option');
                exportOption.value = type;
                exportOption.textContent = type;
                exportTypeFilter.appendChild(exportOption);
            });
        })
        .catch(error => {
            console.error('Error loading event types:', error);
        });
}

// Get theme colors for charts
function getThemeColors() {
    const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';

    // In dark mode, use higher contrast colors for text
    const textColor = isDarkMode ?
        'rgb(255, 255, 255)' : // White for dark mode for maximum contrast
        getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface').trim();

    // Use a more visible grid color in dark mode
    const gridColor = isDarkMode ?
        'rgba(255, 255, 255, 0.2)' : // Semi-transparent white for dark mode
        getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant').trim();

    // Define bright, high-contrast colors for both dark and light modes
    const chartColorsDark = [
        'rgb(162, 201, 255)', // Light blue - primary
        'rgb(193, 194, 248)', // Light purple - tertiary
        'rgb(255, 180, 171)', // Light red - error
        'rgb(72, 189, 84)',   // Green - other
        'rgb(25, 177, 212)',  // Cyan - convert
        'rgb(25, 101, 212)',  // Blue - sign
        'rgb(255, 120, 146)', // Pink - security
        'rgb(104, 220, 149)', // Light green - convertto
        'rgb(212, 172, 25)',  // Yellow - image
        'rgb(245, 84, 84)',   // Red - advance
    ];

    const chartColorsLight = [
        'rgb(0, 96, 170)',    // Blue - primary
        'rgb(88, 90, 138)',   // Purple - tertiary
        'rgb(186, 26, 26)',   // Red - error
        'rgb(72, 189, 84)',   // Green - other
        'rgb(25, 177, 212)',  // Cyan - convert
        'rgb(25, 101, 212)',  // Blue - sign
        'rgb(255, 120, 146)', // Pink - security
        'rgb(104, 220, 149)', // Light green - convertto
        'rgb(212, 172, 25)',  // Yellow - image
        'rgb(245, 84, 84)',   // Red - advance
    ];

    return {
        text: textColor,
        grid: gridColor,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface-container').trim(),
        chartColors: isDarkMode ? chartColorsDark : chartColorsLight,
        isDarkMode: isDarkMode
    };
}

// Function to generate a palette of colors for charts
function getChartColors(count, opacity = 0.6) {
    try {
        // Use theme colors first
        const themeColors = getThemeColors();
        if (themeColors && themeColors.chartColors && themeColors.chartColors.length > 0) {
            const result = [];
            for (let i = 0; i < count; i++) {
                // Get the raw color and add opacity
                let color = themeColors.chartColors[i % themeColors.chartColors.length];
                // If it's rgb() format, convert to rgba()
                if (color.startsWith('rgb(')) {
                    color = color.replace('rgb(', '').replace(')', '');
                    result.push(`rgba(${color}, ${opacity})`);
                } else {
                    // Just use the color directly
                    result.push(color);
                }
            }
            return result;
        }
    } catch (e) {
        console.warn('Error using theme colors, falling back to default colors', e);
    }

    // Base colors - a larger palette than the default
    const colors = [
        [54, 162, 235],   // blue
        [255, 99, 132],   // red
        [75, 192, 192],   // teal
        [255, 206, 86],   // yellow
        [153, 102, 255],  // purple
        [255, 159, 64],   // orange
        [46, 204, 113],   // green
        [231, 76, 60],    // dark red
        [52, 152, 219],   // light blue
        [155, 89, 182],   // violet
        [241, 196, 15],   // dark yellow
        [26, 188, 156],   // turquoise
        [230, 126, 34],   // dark orange
        [149, 165, 166],  // light gray
        [243, 156, 18],   // amber
        [39, 174, 96],    // emerald
        [211, 84, 0],     // dark orange red
        [22, 160, 133],   // green sea
        [41, 128, 185],   // belize hole
        [142, 68, 173]    // wisteria
    ];

    const result = [];

    // Always use the same format regardless of color source
    if (count > colors.length) {
        // Generate colors algorithmically for large sets
        for (let i = 0; i < count; i++) {
            // Generate a color based on position in the hue circle (0-360)
            const hue = (i * 360 / count) % 360;
            const sat = 70 + Math.random() * 10; // 70-80%
            const light = 50 + Math.random() * 10; // 50-60%

            result.push(`hsla(${hue}, ${sat}%, ${light}%, ${opacity})`);
        }
    } else {
        // Use colors from our palette but also return in hsla format for consistency
        for (let i = 0; i < count; i++) {
            const color = colors[i % colors.length];
            result.push(`rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`);
        }
    }

    return result;
}
