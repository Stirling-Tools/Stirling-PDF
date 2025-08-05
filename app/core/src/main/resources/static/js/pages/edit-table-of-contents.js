document.addEventListener("DOMContentLoaded", function () {
  const bookmarksContainer = document.getElementById("bookmarks-container");
  const errorMessageContainer = document.getElementById("error-message-container");
  const addBookmarkBtn = document.getElementById("addBookmarkBtn");
  const bookmarkDataInput = document.getElementById("bookmarkData");
  let bookmarks = [];
  let counter = 0; // Used for generating unique IDs

  // callback function on file input change to extract bookmarks from PDF
  async function getBookmarkDataFromPdf(event) {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const formData = new FormData();
    formData.append("file", event.target.files[0]);

    try {
      // Call the API to extract bookmarks using fetchWithCsrf for CSRF protection
      const response = await fetchWithCsrf("/api/v1/general/extract-bookmarks", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch API: ${response.status} ${response.statusText}`);
      }

      const extractedBookmarks = await response.json();
      return extractedBookmarks;
    } catch (error) {
      throw new Error("Error extracting bookmark data:", error);
    }
  }

  // callback function on file input change to extract bookmarks from JSON
  async function getBookmarkDataFromJson(event) {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];

    try {
      const fileText = await file.text();
      const jsonData = JSON.parse(fileText);
      return jsonData;
    } catch (error) {
      throw new Error(`Error extracting bookmark data: error while reading or parsing JSON file: ${error.message}`);
    }
  }

  // display new bookmark data given by a callback function that loads or fetches the data
  async function loadBookmarks(getBookmarkDataCallback) {
    // reset bookmarks
    bookmarks = [];
    updateBookmarksUI();
    showLoadingIndicator();

    try {
      // Get new bookmarks from the callback
      const newBookmarks = await getBookmarkDataCallback();

      // Convert extracted bookmarks to our format with IDs
      if (newBookmarks && newBookmarks.length > 0) {
        bookmarks = newBookmarks.map(convertExtractedBookmark);
      }
    } catch (error) {
      bookmarks = [];
      throw new Error(`Error loading bookmarks: ${error}`);
    } finally {
      removeLoadingIndicator();
      updateBookmarksUI();
    }
  }

  // Add event listener to the file input to extract existing bookmarks
  document.getElementById("fileInput-input").addEventListener("change", async function (event) {
    try {
      await loadBookmarks(async function () {
        return getBookmarkDataFromPdf(event);
      });
    } catch {
      showErrorMessage("Failed to extract bookmarks. You can still create new ones.");
    }
  });

  function showLoadingIndicator() {
    const loadingEl = document.createElement("div");
    loadingEl.className = "alert alert-info";
    loadingEl.textContent = "Loading bookmarks from PDF...";
    loadingEl.id = "loading-bookmarks";
    errorMessageContainer.innerHTML = "";
    bookmarksContainer.innerHTML = "";
    bookmarksContainer.appendChild(loadingEl);
  }

  function removeLoadingIndicator() {
    const loadingEl = document.getElementById("loading-bookmarks");
    if (loadingEl) {
      loadingEl.remove();
    }
  }

  function showErrorMessage(message) {
    const errorEl = document.createElement("div");
    errorEl.className = "alert alert-danger";
    errorEl.textContent = message;
    errorMessageContainer.appendChild(errorEl);
  }

  function showEmptyState() {
    const emptyStateEl = document.createElement("div");
    emptyStateEl.className = "empty-bookmarks mb-3";
    emptyStateEl.innerHTML = `
      <span class="material-symbols-rounded mb-2" style="font-size: 48px;">bookmark_add</span>
      <h5>No bookmarks found</h5>
      <p class="mb-3">This PDF doesn't have any bookmarks yet. Add your first bookmark to get started.</p>
      <button type="button" class="btn btn-primary btn-add-first-bookmark">
        <span class="material-symbols-rounded">add</span> Add First Bookmark
      </button>
    `;

    // Add event listener to the "Add First Bookmark" button
    emptyStateEl.querySelector(".btn-add-first-bookmark").addEventListener("click", function () {
      addBookmark(null, "New Bookmark", 1);
      emptyStateEl.remove();
    });

    bookmarksContainer.appendChild(emptyStateEl);
  }

  // Function to convert extracted bookmarks to our format with IDs
  function convertExtractedBookmark(bookmark) {
    counter++;
    const result = {
      id: Date.now() + counter, // Generate a unique ID
      title: bookmark.title || "Untitled Bookmark",
      pageNumber: bookmark.pageNumber || 1,
      children: [],
      expanded: false, // All bookmarks start collapsed for better visibility
    };

    // Convert children recursively
    if (bookmark.children && bookmark.children.length > 0) {
      result.children = bookmark.children.map((child) => {
        return convertExtractedBookmark(child);
      });
    }

    return result;
  }

  // Add bookmark button click handler
  addBookmarkBtn.addEventListener("click", function (e) {
    e.preventDefault();
    addBookmark();
  });

  // Add form submit handler to update JSON data
  document.getElementById("editTocForm").addEventListener("submit", function () {
    updateBookmarkData();
  });

  function addBookmark(parent = null, title = "", pageNumber = 1) {
    counter++;
    const newBookmark = {
      id: Date.now() + counter,
      title: title || "New Bookmark",
      pageNumber: pageNumber || 1,
      children: [],
      expanded: false, // New bookmarks start collapsed
    };

    if (parent === null) {
      bookmarks.push(newBookmark);
    } else {
      const parentBookmark = findBookmark(bookmarks, parent);
      if (parentBookmark) {
        parentBookmark.children.push(newBookmark);
        parentBookmark.expanded = true; // Auto-expand the parent when adding a child
      } else {
        // Add to root level if parent not found
        bookmarks.push(newBookmark);
      }
    }

    updateBookmarksUI();

    // After updating UI, find and focus the new bookmark's title field
    setTimeout(() => {
      const newElement = document.querySelector(`[data-id="${newBookmark.id}"]`);
      if (newElement) {
        const titleInput = newElement.querySelector(".bookmark-title");
        if (titleInput) {
          titleInput.focus();
          titleInput.select();
        }
        // Scroll to the new element
        newElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  function findBookmark(bookmarkArray, id) {
    for (const bookmark of bookmarkArray) {
      if (bookmark.id === id) {
        return bookmark;
      }
      if (bookmark.children.length > 0) {
        const found = findBookmark(bookmark.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  // Find the parent bookmark of a given bookmark by ID
  function findParentBookmark(bookmarkArray, id, parent = null) {
    for (const bookmark of bookmarkArray) {
      if (bookmark.id === id) {
        return parent; // Return the parent ID (or null if top-level)
      }

      if (bookmark.children.length > 0) {
        const found = findParentBookmark(bookmark.children, id, bookmark.id);
        if (found !== undefined) return found;
      }
    }
    return undefined; // Not found at this level
  }

  function removeBookmark(id) {
    // Remove from top level
    const index = bookmarks.findIndex((b) => b.id === id);
    if (index !== -1) {
      bookmarks.splice(index, 1);
      updateBookmarksUI();
      return;
    }

    // Remove from children
    function removeFromChildren(bookmarkArray, id) {
      for (const bookmark of bookmarkArray) {
        const childIndex = bookmark.children.findIndex((b) => b.id === id);
        if (childIndex !== -1) {
          bookmark.children.splice(childIndex, 1);
          return true;
        }
        if (removeFromChildren(bookmark.children, id)) {
          return true;
        }
      }
      return false;
    }

    if (removeFromChildren(bookmarks, id)) {
      updateBookmarksUI();
    }

    // If no bookmarks left, show empty state
    if (bookmarks.length === 0) {
      showEmptyState();
    }
  }

  function toggleBookmarkExpanded(id) {
    const bookmark = findBookmark(bookmarks, id);
    if (bookmark) {
      bookmark.expanded = !bookmark.expanded;
      updateBookmarksUI();
    }
  }

  function updateBookmarkData() {
    // Create a clean version without the IDs for submission
    const cleanBookmarks = bookmarks.map(cleanBookmark);
    bookmarkDataInput.value = JSON.stringify(cleanBookmarks);
  }

  function cleanBookmark(bookmark) {
    return {
      title: bookmark.title,
      pageNumber: bookmark.pageNumber,
      children: bookmark.children.map(cleanBookmark),
    };
  }

  function updateBookmarksUI() {
    if (!bookmarksContainer) {
      return;
    }

    // Only clear the container if there are no error messages or loading indicators
    if (!document.querySelector("#bookmarks-container .alert")) {
      bookmarksContainer.innerHTML = "";
    }

    // Check if there are bookmarks to display
    if (bookmarks.length === 0 && !document.querySelector(".empty-bookmarks")) {
      showEmptyState();
    } else {
      // Remove empty state if it exists and there are bookmarks
      const emptyState = document.querySelector(".empty-bookmarks");
      if (emptyState && bookmarks.length > 0) {
        emptyState.remove();
      }

      // Create bookmark elements
      bookmarks.forEach((bookmark) => {
        const bookmarkElement = createBookmarkElement(bookmark);
        bookmarksContainer.appendChild(bookmarkElement);
      });
    }

    updateBookmarkData();

    // Initialize tooltips for dynamically added elements
    if (typeof $ !== "undefined") {
      $('[data-bs-toggle="tooltip"]').tooltip();
    }
  }

  // Create the main bookmark element with collapsible interface
  function createBookmarkElement(bookmark, level = 0) {
    const bookmarkEl = document.createElement("div");
    bookmarkEl.className = "bookmark-item";
    bookmarkEl.dataset.id = bookmark.id;
    bookmarkEl.dataset.level = level;

    // Create the header (always visible part)
    const header = createBookmarkHeader(bookmark, level);
    bookmarkEl.appendChild(header);

    // Create the content (collapsible part)
    const content = document.createElement("div");
    content.className = "bookmark-content";
    if (!bookmark.expanded) {
      content.style.display = "none";
    }

    // Main input row
    const inputRow = createInputRow(bookmark);
    content.appendChild(inputRow);
    bookmarkEl.appendChild(content);

    // Add children container if has children and expanded
    if (bookmark.children && bookmark.children.length > 0) {
      const childrenContainer = createChildrenContainer(bookmark, level);
      if (bookmark.expanded) {
        bookmarkEl.appendChild(childrenContainer);
      }
    }

    return bookmarkEl;
  }

  // Create the header that's always visible
  function createBookmarkHeader(bookmark, level) {
    const header = document.createElement("div");
    header.className = "bookmark-header";
    if (!bookmark.expanded) {
      header.classList.add("collapsed");
    }

    // Left side of header with expand/collapse and info
    const headerLeft = document.createElement("div");
    headerLeft.className = "d-flex align-items-center";

    // Toggle expand/collapse icon with child count
    const toggleContainer = document.createElement("div");
    toggleContainer.className = "d-flex align-items-center";
    toggleContainer.style.marginRight = "8px";

    // Only show toggle if has children
    if (bookmark.children && bookmark.children.length > 0) {
      // Create toggle icon
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "material-symbols-rounded toggle-icon me-1";
      toggleIcon.textContent = "expand_more";
      toggleIcon.style.cursor = "pointer";
      toggleContainer.appendChild(toggleIcon);

      // Add child count indicator
      const childCount = document.createElement("span");
      childCount.className = "badge rounded-pill";
      // Use theme-appropriate badge color
      const isDarkMode = document.documentElement.getAttribute("data-bs-theme") === "dark";
      childCount.classList.add(isDarkMode ? "bg-info" : "bg-secondary");
      childCount.style.fontSize = "0.7rem";
      childCount.style.padding = "0.2em 0.5em";
      childCount.textContent = bookmark.children.length;
      childCount.setAttribute("data-bs-toggle", "tooltip");
      childCount.setAttribute("data-bs-placement", "top");
      childCount.title = `${bookmark.children.length} child bookmark${bookmark.children.length > 1 ? "s" : ""}`;
      toggleContainer.appendChild(childCount);
    } else {
      // Add spacer if no children
      const spacer = document.createElement("span");
      spacer.style.width = "24px";
      spacer.style.display = "inline-block";
      toggleContainer.appendChild(spacer);
    }

    headerLeft.appendChild(toggleContainer);

    // Level indicator for nested items
    if (level > 0) {
      // Add relationship indicator visual line
      const relationshipIndicator = document.createElement("div");
      relationshipIndicator.className = "bookmark-relationship-indicator";

      const line = document.createElement("div");
      line.className = "relationship-line";
      relationshipIndicator.appendChild(line);

      const arrow = document.createElement("div");
      arrow.className = "relationship-arrow";
      relationshipIndicator.appendChild(arrow);

      header.appendChild(relationshipIndicator);

      // Text indicator
      const levelIndicator = document.createElement("span");
      levelIndicator.className = "bookmark-level-indicator";
      levelIndicator.textContent = `Child`;
      headerLeft.appendChild(levelIndicator);
    }

    // Title preview
    const titlePreview = document.createElement("span");
    titlePreview.className = "bookmark-title-preview";
    titlePreview.textContent = bookmark.title;
    headerLeft.appendChild(titlePreview);

    // Page number preview
    const pagePreview = document.createElement("span");
    pagePreview.className = "bookmark-page-preview";
    pagePreview.textContent = `Page ${bookmark.pageNumber}`;
    headerLeft.appendChild(pagePreview);

    // Right side of header with action buttons
    const headerRight = document.createElement("div");
    headerRight.className = "bookmark-actions-header";

    // Quick add buttons with clear visual distinction - using Stirling-PDF's tooltip system
    const quickAddChildButton = createButton("subdirectory_arrow_right", "btn-add-child", "Add child bookmark", function (e) {
      e.preventDefault();
      e.stopPropagation();
      addBookmark(bookmark.id);
    });

    const quickAddSiblingButton = createButton("add", "btn-add-sibling", "Add sibling bookmark", function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Find parent of current bookmark
      const parentId = findParentBookmark(bookmarks, bookmark.id);
      addBookmark(parentId, "", bookmark.pageNumber); // Same level as current bookmark
    });

    // Quick remove button
    const quickRemoveButton = createButton("delete", "btn-outline-danger", "Remove bookmark", function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (
        confirm(
          "Are you sure you want to remove this bookmark" + (bookmark.children.length > 0 ? " and all its children?" : "?")
        )
      ) {
        removeBookmark(bookmark.id);
      }
    });

    headerRight.appendChild(quickAddChildButton);
    headerRight.appendChild(quickAddSiblingButton);
    headerRight.appendChild(quickRemoveButton);

    // Assemble header
    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    // Add click handler for expansion toggle
    header.addEventListener("click", function (e) {
      // Only toggle if not clicking on buttons
      if (!e.target.closest("button")) {
        toggleBookmarkExpanded(bookmark.id);
      }
    });

    return header;
  }

  function createInputRow(bookmark) {
    const row = document.createElement("div");
    row.className = "row";

    // Title input
    row.appendChild(createTitleInputElement(bookmark));

    // Page input
    row.appendChild(createPageInputElement(bookmark));

    return row;
  }

  function createTitleInputElement(bookmark) {
    const titleCol = document.createElement("div");
    titleCol.className = "col-md-8";

    const titleGroup = document.createElement("div");
    titleGroup.className = "mb-3";

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Title";
    titleLabel.className = "form-label";

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "form-control bookmark-title";
    titleInput.value = bookmark.title;
    titleInput.addEventListener("input", function () {
      bookmark.title = this.value;
      updateBookmarkData();

      // Also update the preview in the header
      const header = titleInput.closest(".bookmark-item").querySelector(".bookmark-title-preview");
      if (header) {
        header.textContent = this.value;
      }
    });

    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    titleCol.appendChild(titleGroup);

    return titleCol;
  }

  function createPageInputElement(bookmark) {
    const pageCol = document.createElement("div");
    pageCol.className = "col-md-4";

    const pageGroup = document.createElement("div");
    pageGroup.className = "mb-3";

    const pageLabel = document.createElement("label");
    pageLabel.textContent = "Page";
    pageLabel.className = "form-label";

    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.className = "form-control bookmark-page";
    pageInput.value = bookmark.pageNumber;
    pageInput.min = 1;
    pageInput.addEventListener("input", function () {
      bookmark.pageNumber = parseInt(this.value) || 1;
      updateBookmarkData();

      // Also update the preview in the header
      const header = pageInput.closest(".bookmark-item").querySelector(".bookmark-page-preview");
      if (header) {
        header.textContent = `Page ${bookmark.pageNumber}`;
      }
    });

    pageGroup.appendChild(pageLabel);
    pageGroup.appendChild(pageInput);
    pageCol.appendChild(pageGroup);

    return pageCol;
  }

  function createButton(icon, className, title, clickHandler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${className} btn-bookmark-action`;
    button.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;

    // Use Bootstrap tooltips
    button.setAttribute("data-bs-toggle", "tooltip");
    button.setAttribute("data-bs-placement", "top");
    button.title = title;

    button.addEventListener("click", clickHandler);
    return button;
  }

  function createChildrenContainer(bookmark, level) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "bookmark-children";

    bookmark.children.forEach((child) => {
      childrenContainer.appendChild(createBookmarkElement(child, level + 1));
    });

    return childrenContainer;
  }

  // Update the add bookmark button appearance with clear visual cue
  addBookmarkBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Add Top-level Bookmark';
  addBookmarkBtn.className = "btn btn-primary btn-add-bookmark top-level";

  // Use Bootstrap tooltips
  addBookmarkBtn.setAttribute("data-bs-toggle", "tooltip");
  addBookmarkBtn.setAttribute("data-bs-placement", "top");
  addBookmarkBtn.title = "Add a new top-level bookmark";

  // Add icon to empty state button as well
  const updateEmptyStateButton = function () {
    const emptyStateBtn = document.querySelector(".btn-add-first-bookmark");
    if (emptyStateBtn) {
      emptyStateBtn.innerHTML = '<span class="material-symbols-rounded">add</span> Add First Bookmark';
      emptyStateBtn.setAttribute("data-bs-toggle", "tooltip");
      emptyStateBtn.setAttribute("data-bs-placement", "top");
      emptyStateBtn.title = "Add first bookmark";

      // Initialize tooltips for the empty state button
      if (typeof $ !== "undefined") {
        $('[data-bs-toggle="tooltip"]').tooltip();
      }
    }
  };

  // Initialize with an empty state if no bookmarks
  if (bookmarks.length === 0) {
    showEmptyState();
    updateEmptyStateButton();
  }

  // Add bookmarks Import/Export functionality

  // Import/Export button references
  const importDefaultBtn = document.getElementById("importDefaultBtn");
  const exportDefaultBtn = document.getElementById("exportDefaultBtn");
  const importUploadJsonFileInput = document.getElementById("importUploadJsonFileInput");
  const importPasteFromClipboardBtn = document.getElementById("importPasteFromClipboardBtn");
  const exportDownloadJsonFileBtn = document.getElementById("exportDownloadJsonFileBtn");
  const exportCopyToClipboardBtn = document.getElementById("exportCopyToClipboardBtn");

  // display import/export from/to clipboard buttons if supported
  if (navigator.clipboard && navigator.clipboard.readText) {
    importPasteFromClipboardBtn.parentElement.classList.remove("d-none");
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    exportCopyToClipboardBtn.parentElement.classList.remove("d-none");
  }

  function flashButtonSuccess(button) {
    const originalClass = button.className;

    button.classList.remove("btn-outline-primary");
    button.classList.add("btn-success", "success-flash");

    setTimeout(() => {
      button.className = originalClass;
    }, 1000);
  }

  // Import handlers
  async function handleJsonFileInputChange(event) {
    try {
      await loadBookmarks(async function () {
        return getBookmarkDataFromJson(event);
      });
      flashButtonSuccess(importDefaultBtn);
    } catch (error) {
      console.error(`Failed to import bookmarks from JSON file: ${error.message}`);
    }
  }

  async function importBookmarksFromClipboard() {
    console.log("Importing bookmarks from clipboard...");

    try {
      await loadBookmarks(async function () {
        const clipboardText = await navigator.clipboard.readText();
        if (!clipboardText) return [];

        return JSON.parse(clipboardText);
      });
      flashButtonSuccess(importDefaultBtn);
    } catch (error) {
      console.error(`Failed to import bookmarks from clipboard: ${error.message}`);
    }
  }

  async function handleBookmarksPasteFromClipboard(event) {
    // do not override normal paste behavior on input fields
    if (event.target.tagName.toLowerCase() === "input") return;

    try {
      await loadBookmarks(async function () {
        const clipboardText = event.clipboardData?.getData("text/plain");
        if (!clipboardText) return [];

        return JSON.parse(clipboardText);
      });
      flashButtonSuccess(importDefaultBtn);
    } catch (error) {
      console.error(`Failed to import bookmarks from clipboard (ctrl-v): ${error.message}`);
    }
  }

  // Export handlers
  async function exportBookmarksToJson() {
    console.log("Exporting bookmarks to JSON...");

    try {
      const bookmarkData = bookmarkDataInput.value;
      const blob = new Blob([bookmarkData], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "bookmarks.json";
      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      flashButtonSuccess(exportDefaultBtn);
    } catch (error) {
      console.error(`Failed to export bookmarks to JSON: ${error.message}`);
    }
  }

  async function exportBookmarksToClipboard() {
    const bookmarkData = bookmarkDataInput.value;
    try {
      await navigator.clipboard.writeText(bookmarkData);
      flashButtonSuccess(exportDefaultBtn);
    } catch (error) {
      console.error(`Failed to export bookmarks to clipboard: ${error.message}`);
    }
  }

  async function handleBookmarksCopyToClipboard(event) {
    // do not override normal copy behavior on input fields
    if (event.target.tagName.toLowerCase() === "input") return;

    const bookmarkData = bookmarkDataInput.value;

    try {
      event.clipboardData.setData("text/plain", bookmarkData);
      event.preventDefault();
      flashButtonSuccess(exportDefaultBtn);
    } catch (error) {
      console.error(`Failed to export bookmarks to clipboard (ctrl-c): ${error.message}`);
    }
  }

  // register event listeners for import/export functions
  importUploadJsonFileInput.addEventListener("change", handleJsonFileInputChange);
  importPasteFromClipboardBtn.addEventListener("click", importBookmarksFromClipboard);
  exportDownloadJsonFileBtn.addEventListener("click", exportBookmarksToJson);
  exportCopyToClipboardBtn.addEventListener("click", exportBookmarksToClipboard);
  document.body.addEventListener("copy", handleBookmarksCopyToClipboard);
  document.body.addEventListener("paste", handleBookmarksPasteFromClipboard);
  // set default actions
  // importDefaultBtn is already handled by being a label for the file input
  exportDefaultBtn.addEventListener("click", exportBookmarksToJson);

  // Listen for theme changes to update badge colors
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      if (mutation.attributeName === "data-bs-theme") {
        const isDarkMode = document.documentElement.getAttribute("data-bs-theme") === "dark";
        document.querySelectorAll(".badge").forEach((badge) => {
          badge.classList.remove("bg-secondary", "bg-info");
          badge.classList.add(isDarkMode ? "bg-info" : "bg-secondary");
        });
      }
    });
  });

  observer.observe(document.documentElement, { attributes: true });

  // Add visual enhancement to clearly show the top-level/child relationship
  document.addEventListener("mouseover", function (e) {
    // When hovering over add buttons, highlight their relationship targets
    const button = e.target.closest(".btn-add-child, .btn-add-sibling");
    if (button) {
      if (button.classList.contains("btn-add-child")) {
        // Highlight parent-child relationship
        const bookmarkItem = button.closest(".bookmark-item");
        if (bookmarkItem) {
          bookmarkItem.style.boxShadow = "0 0 0 2px var(--btn-add-child-border, #198754)";
        }
      } else if (button.classList.contains("btn-add-sibling")) {
        // Highlight sibling relationship
        const bookmarkItem = button.closest(".bookmark-item");
        if (bookmarkItem) {
          // Find siblings
          const parent = bookmarkItem.parentElement;
          const siblings = parent.querySelectorAll(":scope > .bookmark-item");
          siblings.forEach((sibling) => {
            if (sibling !== bookmarkItem) {
              sibling.style.boxShadow = "0 0 0 2px var(--btn-add-sibling-border, #0d6efd)";
            }
          });
        }
      }
    }
  });

  document.addEventListener("mouseout", function (e) {
    // Remove highlights when not hovering
    const button = e.target.closest(".btn-add-child, .btn-add-sibling");
    if (button) {
      // Remove all highlights
      document.querySelectorAll(".bookmark-item").forEach((item) => {
        item.style.boxShadow = "";
      });
    }
  });
});
