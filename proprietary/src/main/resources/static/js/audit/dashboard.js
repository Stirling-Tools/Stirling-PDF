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

// Debug logger function
let debugEnabled = false; // Set to false by default in production
function debugLog(message, data) {
    if (!debugEnabled) return;
    
    const console = document.getElementById('debug-console');
    if (console) {
        if (console.style.display === 'none' || !console.style.display) {
            console.style.display = 'block';
        }
        
        const time = new Date().toLocaleTimeString();
        let logMessage = `[${time}] ${message}`;
        
        if (data !== undefined) {
            if (typeof data === 'object') {
                try {
                    logMessage += ': ' + JSON.stringify(data);
                } catch (e) {
                    logMessage += ': ' + data;
                }
            } else {
                logMessage += ': ' + data;
            }
        }
        
        const logLine = document.createElement('div');
        logLine.textContent = logMessage;
        console.appendChild(logLine);
        console.scrollTop = console.scrollHeight;
        
        // Keep only last 100 lines
        while (console.childNodes.length > 100) {
            console.removeChild(console.firstChild);
        }
    }
    
    // Also log to browser console
    if (data !== undefined) {
        window.console.log(message, data);
    } else {
        window.console.log(message);
    }
}

// Add keyboard shortcut to toggle debug console
document.addEventListener('keydown', function(e) {
    if (e.key === 'F12' && e.ctrlKey) {
        const console = document.getElementById('debug-console');
        if (console) {
            console.style.display = console.style.display === 'none' || !console.style.display ? 'block' : 'none';
            e.preventDefault();
        }
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    debugLog('Page initialized');
    
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
    
    // Debug log DOM elements
    debugLog('DOM elements initialized', {
        auditTableBody: !!auditTableBody,
        pageSizeSelect: !!pageSizeSelect
    });
    
    // Load event types for dropdowns
    loadEventTypes();
    
    // Show a loading message immediately
    if (auditTableBody) {
        auditTableBody.innerHTML = 
            '<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Loading audit data...</td></tr>';
    } else {
        debugLog('ERROR: auditTableBody element not found!');
    }
    
    // Make a direct API call first to avoid validation issues
    loadAuditData(0, pageSize);
    
    // Load statistics for dashboard
    loadStats(7);
    
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
        debugLog('Applying filters and resetting to page 0');
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
        
        debugLog('Resetting filters and going to page 0');
        
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
                
                debugLog('Radio format selected', radio.value);
            });
        }
    });
    
    // Handle export button with debug
    exportButton.onclick = function(e) {
        debugLog('Export button clicked');
        e.preventDefault();
        
        // Get selected format with fallback
        const selectedRadio = document.querySelector('input[name="exportFormat"]:checked');
        const exportFormat = selectedRadio ? selectedRadio.value : 'csv';
        
        debugLog('Selected format', exportFormat);
        exportAuditData(exportFormat);
        return false;
    };
    
    // Set up pagination buttons
    document.getElementById('page-first').onclick = function() {
        debugLog('First page button clicked');
        if (currentPage > 0) {
            goToPage(0);
        }
        return false;
    };
    
    document.getElementById('page-prev').onclick = function() {
        debugLog('Previous page button clicked');
        if (currentPage > 0) {
            goToPage(currentPage - 1);
        }
        return false;
    };
    
    document.getElementById('page-next').onclick = function() {
        debugLog('Next page button clicked');
        if (currentPage < totalPages - 1) {
            goToPage(currentPage + 1);
        }
        return false;
    };
    
    document.getElementById('page-last').onclick = function() {
        debugLog('Last page button clicked');
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
    
    debugLog('Loading audit data', {
        currentPage: currentPage,
        requestedPage: requestedPage, 
        pageSize: pageSize, 
        realPageSize: realPageSize
    });
    
    showLoading('table-loading');
    
    // Always request page 0 from server, but with increased page size if needed
    let url = `/audit/data?page=${requestedPage}&size=${realPageSize}`;
    
    if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;
    if (principalFilter) url += `&principal=${encodeURIComponent(principalFilter)}`;
    if (startDateFilter) url += `&startDate=${startDateFilter}`;
    if (endDateFilter) url += `&endDate=${endDateFilter}`;
    
    debugLog('Fetching URL', url);
    
    // Update page indicator
    if (document.getElementById('page-indicator')) {
        document.getElementById('page-indicator').textContent = `Page ${requestedPage + 1} of ?`;
    }
    
    fetch(url)
        .then(response => {
            debugLog('Response received', response.status);
            return response.json();
        })
        .then(data => {
            debugLog('Data received', {
                totalPages: data.totalPages,
                serverPage: data.currentPage,
                totalElements: data.totalElements,
                contentSize: data.content.length
            });
            
            // Calculate the correct slice of data to show for the requested page
            let displayContent = data.content;
            
            // Render the correct slice of data
            renderTable(displayContent);
            
            // Calculate total pages based on the actual total elements
            const calculatedTotalPages = Math.ceil(data.totalElements / realPageSize);
            totalPages = calculatedTotalPages;
            currentPage = requestedPage; // Use our tracked page, not server's
            
            debugLog('Pagination state updated', {
                totalPages: totalPages,
                currentPage: currentPage
            });
            
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
                debugLog('Restored original page size', pageSize);
            }
            
            // Store original page size for recovery
            window.originalPageSize = realPageSize;
            
            // Clear busy flag
            window.paginationBusy = false;
            debugLog('Pagination completed successfully');
        })
        .catch(error => {
            debugLog('Error loading data', error.message);
            if (auditTableBody) {
                auditTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Error loading data: ${error.message}</td></tr>`;
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
    
    fetch(`/audit/stats?days=${days}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('total-events').textContent = data.totalEvents;
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
    
    let url = format === 'json' ? '/audit/export/json?' : '/audit/export?';
    
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (principal) url += `&principal=${encodeURIComponent(principal)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    
    // Trigger download
    window.location.href = url;
}

// Render table with audit data
function renderTable(events) {
    debugLog('renderTable called with', events ? events.length : 0, 'events');
    
    if (!events || events.length === 0) {
        debugLog('No events to render');
        auditTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No audit events found matching the current filters</td></tr>';
        return;
    }
    
    try {
        debugLog('Clearing table body');
        auditTableBody.innerHTML = '';
        
        debugLog('Processing events for table');
        events.forEach((event, index) => {
            try {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${event.id || 'N/A'}</td>
                    <td>${formatDate(event.timestamp)}</td>
                    <td>${escapeHtml(event.principal || 'N/A')}</td>
                    <td>${escapeHtml(event.type || 'N/A')}</td>
                    <td><button class="btn btn-sm btn-outline-primary view-details">View Details</button></td>
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
                debugLog('Error rendering row ' + index, rowError.message);
            }
        });
        
        debugLog('Table rendering complete');
    } catch (e) {
        debugLog('Error in renderTable', e.message);
        auditTableBody.innerHTML = '<tr><td colspan="5" class="text-center">Error rendering table: ' + e.message + '</td></tr>';
    }
}

// Show event details in modal
function showEventDetails(event) {
    modalId.textContent = event.id;
    modalPrincipal.textContent = event.principal;
    modalType.textContent = event.type;
    modalTimestamp.textContent = formatDate(event.timestamp);
    
    // Format JSON data
    try {
        const dataObj = JSON.parse(event.data);
        modalData.textContent = JSON.stringify(dataObj, null, 2);
    } catch (e) {
        modalData.textContent = event.data;
    }
    
    // Show the modal
    const modal = new bootstrap.Modal(eventDetailsModal);
    modal.show();
}

// No need for a dynamic pagination renderer anymore as we're using static buttons

// Direct pagination approach - server seems to be hard-limited to returning 20 items
function goToPage(page) {
    debugLog('goToPage called with page', page);
    
    // Basic validation - totalPages may not be initialized on first load
    if (page < 0) {
        debugLog('Invalid page', page);
        return;
    }
    
    // Skip validation against totalPages on first load
    if (totalPages > 0 && page >= totalPages) {
        debugLog('Page exceeds total pages', page);
        return;
    }
    
    // Simple guard flag
    if (window.paginationBusy) {
        debugLog('Pagination busy, ignoring request');
        return;
    }
    window.paginationBusy = true;
    
    try {
        debugLog('Setting page to', page);
        
        // Store the requested page for later
        window.requestedPage = page;
        currentPage = page;
        
        // Update UI immediately for user feedback
        document.getElementById('currentPage').textContent = page + 1;
        
        // Load data with this page
        loadAuditData(page, pageSize);
    } catch (e) {
        debugLog('Error in pagination', e.message);
        window.paginationBusy = false;
    }
}

// Render charts
function renderCharts(data) {
    // Prepare data for charts
    const typeLabels = Object.keys(data.eventsByType);
    const typeValues = Object.values(data.eventsByType);
    
    const userLabels = Object.keys(data.eventsByPrincipal);
    const userValues = Object.values(data.eventsByPrincipal);
    
    // Sort days for time chart
    const timeLabels = Object.keys(data.eventsByDay).sort();
    const timeValues = timeLabels.map(day => data.eventsByDay[day] || 0);
    
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
                label: 'Events by Type',
                data: typeValues,
                backgroundColor: getChartColors(typeLabels.length),
                borderColor: getChartColors(typeLabels.length, 1), // Full opacity for borders
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
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
                label: 'Events by User',
                data: userValues,
                backgroundColor: getChartColors(userLabels.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
    
    // Time chart
    if (timeChart) {
        timeChart.destroy();
    }
    
    const timeCtx = document.getElementById('timeChart').getContext('2d');
    timeChart = new Chart(timeCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Events Over Time',
                data: timeValues,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
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
    fetch('/audit/types')
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

// Function to generate a palette of colors for charts
function getChartColors(count, opacity = 0.6) {
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