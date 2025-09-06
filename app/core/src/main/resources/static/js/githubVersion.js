function compareVersions(version1, version2) {
  const v1 = version1.split(".");
  const v2 = version2.split(".");

  for (let i = 0; i < v1.length || i < v2.length; i++) {
    const n1 = parseInt(v1[i]) || 0;
    const n2 = parseInt(v2[i]) || 0;

    if (n1 > n2) {
      return 1;
    } else if (n1 < n2) {
      return -1;
    }
  }

  return 0;
}

function getDownloadUrl() {
  // Only show download for non-Docker installations
  if (machineType === 'Docker' || machineType === 'Kubernetes') {
    return null;
  }

  const baseUrl = 'https://files.stirlingpdf.com/';

  // Determine file based on machine type and security
  if (machineType === 'Server-jar') {
    return baseUrl + (activeSecurity ? 'Stirling-PDF-with-login.jar' : 'Stirling-PDF.jar');
  }

  // Client installations
  if (machineType.startsWith('Client-')) {
    const os = machineType.replace('Client-', ''); // win, mac, unix
    const type = activeSecurity ? '-server-security' : '-server';

    if (os === 'unix') {
      return baseUrl + os + type + '.jar';
    } else if (os === 'win') {
      return baseUrl + os + '-installer.exe';
    } else if (os === 'mac') {
      return baseUrl + os + '-installer.dmg';
    }
  }

  return null;
}

// Function to get translated priority text
function getTranslatedPriority(priority) {
  switch(priority?.toLowerCase()) {
    case 'urgent': return updatePriorityUrgent;
    case 'normal': return updatePriorityNormal;
    case 'minor': return updatePriorityMinor;
    case 'low': return updatePriorityLow;
    default: return priority?.toUpperCase() || 'NORMAL';
  }
}

async function getUpdateSummary() {
  // Map Java License enum to API types
  let type = 'normal';
  if (licenseType === 'PRO') {
    type = 'pro';
  } else if (licenseType === 'ENTERPRISE') {
    type = 'enterprise';
  }
  const url = `https://supabase.stirling.com/functions/v1/updates?from=${currentVersion}&type=${type}&login=${activeSecurity}&summary=true`;
  console.log("Fetching update summary from:", url);
  try {
    const response = await fetch(url);
    console.log("Response status:", response.status);
    if (response.status === 200) {
      const data = await response.json();
      return data;
    } else {
      console.error("Failed to fetch update summary from Supabase:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch update summary from Supabase:", error);
    return null;
  }
}

async function getFullUpdateInfo() {
  // Map Java License enum to API types
  let type = 'normal';
  if (licenseType === 'PRO') {
    type = 'pro';
  } else if (licenseType === 'ENTERPRISE') {
    type = 'enterprise';
  }
  const url = `https://supabase.stirling.com/functions/v1/updates?from=${currentVersion}&type=${type}&login=${activeSecurity}&summary=false`;
  console.log("Fetching full update info from:", url);
  try {
    const response = await fetch(url);
    console.log("Full update response status:", response.status);
    if (response.status === 200) {
      const data = await response.json();
      return data;
    } else {
      console.error("Failed to fetch full update info from Supabase:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Failed to fetch full update info from Supabase:", error);
    return null;
  }
}

async function getCurrentVersionFromBypass() {
  const url = "https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/master/build.gradle";
  try {
    const response = await fetch(url);
    if (response.status === 200) {
      const text = await response.text();
      const versionRegex = /version\s*=\s*['"](\d+\.\d+\.\d+)['"]/;
      const match = versionRegex.exec(text);
      if (match) {
        return match[1];
      }
    }
    throw new Error("Version number not found");
  } catch (error) {
    console.error("Failed to fetch latest version from build.gradle:", error);
    return ""; // Return an empty string if the fetch fails
  }
}

async function checkForUpdate() {
  // Initialize the update button as hidden
  var updateBtn = document.getElementById("update-btn") || null;
  var updateLink = document.getElementById("update-link") || null;
  var updateLinkLegacy = document.getElementById("update-link-legacy") || null;
  if (updateBtn !== null) {
    updateBtn.style.display = "none";
    updateBtn.classList.remove("btn-danger", "btn-warning", "btn-outline-primary");
  }
  if (updateLink !== null) {
    updateLink.style.display = "none";
  }
  if (updateLinkLegacy !== null) {
    console.log("hidden!");
    if (!updateLinkLegacy.classList.contains("visually-hidden")) {
      updateLinkLegacy.classList.add("visually-hidden");
    }
  }

  const updateSummary = await getUpdateSummary();
  if (!updateSummary) {
    console.log("No update summary available");
    return;
  }

  console.log("updateSummary=", updateSummary);
  console.log("currentVersion=" + currentVersion);
  console.log("latestVersion=" + updateSummary.latest_version);

  if (updateSummary.latest_version && compareVersions(updateSummary.latest_version, currentVersion) > 0) {
    const priority = updateSummary.max_priority || 'normal';

    if (updateBtn != null) {
      // Style button based on priority
      if (priority === 'urgent') {
        updateBtn.classList.add("btn-danger");
        updateBtn.innerHTML = urgentUpdateAvailable;
      } else if (priority === 'normal') {
        updateBtn.classList.add("btn-warning");
        updateBtn.innerHTML = updateAvailableText;
      } else {
        updateBtn.classList.add("btn-outline-primary");
        updateBtn.innerHTML = updateAvailableText;
      }

      // Store summary for initial display
      updateBtn.setAttribute('data-update-summary', JSON.stringify(updateSummary));
      updateBtn.style.display = "block";

      // Add click handler for update details modal
      updateBtn.onclick = function(e) {
        e.preventDefault();
        showUpdateModal();
      };
    }
    if (updateLink !== null) {
      document.getElementById("update-link").style.display = "flex";
    }
    if (updateLinkLegacy !== null) {
      document.getElementById("app-update").innerHTML = updateAvailable.replace("{0}", '<b>' + currentVersion + '</b>').replace("{1}", '<b>' + updateSummary.latest_version + '</b>');
      if (updateLinkLegacy.classList.contains("visually-hidden")) {
        updateLinkLegacy.classList.remove("visually-hidden");
      }
    }
    console.log("visible");
  } else {
    if (updateLinkLegacy !== null) {
      if (!updateLinkLegacy.classList.contains("visually-hidden")) {
        updateLinkLegacy.classList.add("visually-hidden");
      }
    }
    console.log("hidden");
  }
}

async function showUpdateModal() {
  // Close settings modal if open
  const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
  if (settingsModal) {
    settingsModal.hide();
  }

  // Get summary data from button
  const updateBtn = document.getElementById("update-btn");
  const summaryData = JSON.parse(updateBtn.getAttribute('data-update-summary'));

  // Utility function to escape HTML special characters
  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\//g, '&#x2F;');
  }

  // Create initial modal with loading state
  const initialModalHtml = `
    <div class="modal fade" id="updateModal" tabindex="-1" role="dialog" aria-labelledby="updateModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document" style="max-height: 80vh;">
        <div class="modal-content" style="max-height: 80vh;">
          <div class="modal-header">
            <h5 class="modal-title" id="updateModalLabel">${updateModalTitle}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
          <div class="modal-body" id="updateModalBody" style="max-height: 60vh; overflow-y: auto;">
            <div class="update-summary mb-4">
              <div class="row mb-3">
                <div class="${summaryData.latest_stable_version ? 'col-4' : 'col-6'} text-center">
                  <small class="text-muted">${updateCurrent}</small><br>
                  <strong>${escapeHtml(currentVersion)}</strong>
                </div>
                <div class="${summaryData.latest_stable_version ? 'col-4' : 'col-6'} text-center">
                  <small class="text-muted">${updateLatest}</small><br>
                  <strong class="text-primary">${escapeHtml(summaryData.latest_version)}</strong>
                </div>
                ${summaryData.latest_stable_version ? `
                <div class="col-4 text-center">
                  <small class="text-muted">${updateLatestStable}</small><br>
                  <strong class="text-success">${escapeHtml(summaryData.latest_stable_version)}</strong>
                </div>
                ` : ''}
              </div>
              <div class="alert ${summaryData.max_priority === 'urgent' ? 'alert-danger' : 'alert-warning'}" role="alert">
                <strong>${updatePriority}:</strong> ${getTranslatedPriority(summaryData.max_priority)}
                ${summaryData.recommended_action ? `<br><strong>${updateRecommendedAction}:</strong> ${escapeHtml(summaryData.recommended_action)}` : ''}
              </div>
            </div>

            ${summaryData.any_breaking ? `
              <div class="alert alert-warning" role="alert">
                <h6><strong>${updateBreakingChangesDetected}</strong></h6>
                <p>${updateBreakingChangesMessage}</p>
              </div>
            ` : ''}

            ${summaryData.migration_guides && summaryData.migration_guides.length > 0 ? `
              <div class="migration-guides mb-4">
                <h6>${updateMigrationGuides}</h6>
                <ul class="list-group">
                  ${summaryData.migration_guides.map(guide => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <strong>${updateVersion} ${escapeHtml(guide.version)}:</strong> ${escapeHtml(guide.notes)}
                      </div>
                      <a href="${escapeHtml(guide.url)}" target="_blank" class="btn btn-sm btn-outline-primary">${updateViewGuide}</a>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}

            <div class="text-center">
              <div class="spinner-border text-primary" role="status" id="loadingSpinner">
                <span class="visually-hidden">${updateLoadingDetailedInfo}</span>
              </div>
              <p class="mt-2">${updateLoadingDetailedInfo}</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${updateClose}</button>
            <a href="https://github.com/Stirling-Tools/Stirling-PDF/releases" target="_blank" class="btn btn-outline-primary">${updateViewAllReleases}</a>
            ${getDownloadUrl() ? `<a href="${escapeHtml(getDownloadUrl())}" class="btn btn-success" target="_blank">${updateDownloadLatest}</a>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('updateModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', initialModalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('updateModal'));
  modal.show();

  // Fetch full update info
  const fullUpdateInfo = await getFullUpdateInfo();

  // Update modal with full information
  const modalBody = document.getElementById('updateModalBody');
  if (fullUpdateInfo && fullUpdateInfo.new_versions) {
   const storedMode = localStorage.getItem("dark-mode");
    const isDarkMode = storedMode === "on" ||
                      (storedMode === null && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const darkClasses = isDarkMode ? {
      accordionItem: 'bg-dark border-secondary text-light',
      accordionButton: 'bg-dark text-light border-secondary',
      accordionBody: 'bg-dark text-light'
    } : {
      accordionItem: '',
      accordionButton: '',
      accordionBody: ''
    };

    const detailedVersionsHtml = `
      <div class="detailed-versions mt-4">
        <h6>${updateAvailableUpdates}</h6>
        <div class="accordion" id="versionsAccordion">
          ${fullUpdateInfo.new_versions.map((version, index) => `
            <div class="accordion-item" style="border-color: var(--md-sys-color-outline);">
                          <h2 class="accordion-header"  id="heading${index}">
                             <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" style="color: var(--md-sys-color-on-surface); background-color:
             var(--md-sys-color-surface);" type="button" data-bs-toggle="collapse"
                        data-bs-target="#collapse${index}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="collapse${index}">
                  <div class="d-flex justify-content-between w-100 me-3">
                    <span><strong>${updateVersion} ${version.version}</strong></span>
                    <span class="badge ${version.priority === 'urgent' ? 'bg-danger' : version.priority === 'normal' ? 'bg-warning' : 'bg-secondary'}">${getTranslatedPriority(version.priority)}</span>
                  </div>
                </button>
              </h2>
              <div id="collapse${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}"
                  aria-labelledby="heading${index}" data-bs-parent="#versionsAccordion">
                <div class="accordion-body"  style="color: var(--md-sys-color-on-surface); background-color:
             var(--md-sys-color-surface-bright);">
                  <h6>${version.announcement.title}</h6>
                  <p>${version.announcement.message}</p>
                  ${version.compatibility.breaking_changes ? `
                    <div class="alert alert-warning alert-sm" role="alert">
                      <small><strong>⚠️ ${updateBreakingChanges}</strong> ${version.compatibility.breaking_description || updateBreakingChangesDefault}</small>
                      ${version.compatibility.migration_guide_url ? `<br><a href="${version.compatibility.migration_guide_url}" target="_blank" class="btn btn-sm btn-outline-warning mt-1">${updateMigrationGuide}</a>` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Remove loading spinner and add detailed info
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
      spinner.parentElement.remove();
    }
    modalBody.insertAdjacentHTML('beforeend', detailedVersionsHtml);

      } else {
    // Remove loading spinner if failed to load
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
      spinner.parentElement.innerHTML = `<p class="text-muted">${updateUnableToLoadDetails}</p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", (event) => {
  checkForUpdate();
});
