const fileInput = document.querySelector("input[name='formFillFile']");
const fileChooser = document.querySelector(
  ".custom-file-chooser[data-bs-element-id='formFillFile-input']"
);
const statusEl = document.getElementById("formFillStatus");
const fieldsForm = document.getElementById("formFillFields");
const downloadButton = document.getElementById("formFillDownload");
const batchButton = document.getElementById("formFillBatchDownload");
const batchTextarea = document.getElementById("formFillBatchJson");
const batchFileInput = document.getElementById("formFillBatchFile");
const flattenToggle = document.getElementById("formFillFlatten");
const multiTemplateToggle = document.getElementById("formFillMultiTemplate");

let currentFile = null;
let batchEdited = false;
const DEFAULT_BATCH_PLACEHOLDER = '[{"field":"value"}]';
const multiTemplateRecordCache = new Map();
let previousTemplateFileKeys = [];
const fieldValidationRegistry = new Map();
const fieldMetadata = new Map();
let editingFieldName = null;
const pendingRemovalNames = new Set();
const retainedFieldValues = new Map();
const multiTemplateSelectedFiles = [];
const multiTemplateSelectionIndex = new Map();
let suppressFileInputChange = false;
const fieldOrdinalOrder = new Map();
let nextFieldOrdinalValue = 0;

const editModalEl = document.getElementById("formFieldEditModal");
const editModal =
  editModalEl && window.bootstrap?.Modal
    ? new window.bootstrap.Modal(editModalEl, { backdrop: "static" })
    : null;
const editForm = document.getElementById("formFieldEditForm");
const editInputs = {
  type: document.getElementById("formFieldEditType"),
  name: document.getElementById("formFieldEditName"),
  label: document.getElementById("formFieldEditLabel"),
  defaultValue: document.getElementById("formFieldEditDefault"),
  options: document.getElementById("formFieldEditOptions"),
  required: document.getElementById("formFieldEditRequired"),
  tooltip: document.getElementById("formFieldEditTooltip"),
  multiSelect: document.getElementById("formFieldEditMultiSelect"),
  optionsGroup: document.getElementById("formFieldEditOptionsGroup"),
  multiSelectGroup: document.getElementById("formFieldEditMultiSelectGroup"),
};

const MODIFIABLE_FIELD_TYPES = new Set(["text", "checkbox", "combobox", "listbox"]);
const OPTION_FIELD_TYPES = new Set(["combobox", "listbox"]);

if (editInputs.type) {
  editInputs.type.addEventListener("change", (event) => {
    updateEditTypeControls(event.target?.value ?? "text");
  });
}

if (editForm) {
  editForm.addEventListener("submit", submitEditForm);
}

if (editModalEl) {
  editModalEl.addEventListener("hidden.bs.modal", () => {
    resetEditForm();
  });
}

if (multiTemplateToggle && fileInput) {
  fileInput.multiple = multiTemplateToggle.checked;
}

const STATUS_CLASSES = {
  info: "alert alert-info",
  success: "alert alert-success",
  warning: "alert alert-warning",
  danger: "alert alert-danger",
};

const FILLABLE_TYPES = new Set(["text", "checkbox", "radio", "combobox", "listbox"]);
const DATE_PATTERNS = [
  /\bdate\b/i,
  /\bdob\b/i,
  /\bbirth\b/i,
  /\bexpiry\b/i,
  /\bexpiration\b/i,
  /\bexp(?:iry|iration)?\s*date\b/i,
  /\bissued\b/i,
  /\bissuance\b/i,
  /\bdue\s+date\b/i,
  /\beffective\s+date\b/i,
  /\bstart\s+date\b/i,
  /\bend\s+date\b/i,
];
const EMAIL_FIELD_PATTERNS = [/\bemail\b/i, /\be-mail\b/i, /\bmail\s*address\b/i];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const prefersDayFirst = (() => {
  const localeHint =
    document.documentElement?.dataset?.language ??
    document.documentElement?.getAttribute("lang") ??
    "";
  const normalized = localeHint.toLowerCase();
  if (!normalized) {
    return false;
  }
  return !normalized.startsWith("en-us") && !normalized.startsWith("en_us");
})();

function isMultiTemplateMode() {
  return Boolean(multiTemplateToggle?.checked);
}

function getFileSignature(file) {
  if (!file) return "";
  return `${file.name ?? ""}::${file.size ?? 0}::${file.lastModified ?? 0}`;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExistingBatchRecords() {
  if (!batchTextarea) return [];
  const raw = batchTextarea.value?.trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function updateFileChooserSummary(files) {
  if (!fileChooser) {
    return;
  }
  const selectedFilesContainer = fileChooser.querySelector(".selected-files");
  if (!selectedFilesContainer) {
    return;
  }

  if (!Array.isArray(files) || files.length === 0) {
    selectedFilesContainer.textContent = "";
    return;
  }

  const summary = files
    .map((file) => (file && typeof file.name === "string" ? file.name : ""))
    .filter((name) => name.length > 0)
    .join(", ");
  selectedFilesContainer.textContent = summary;
}

function syncMultiTemplateSelectionToInput() {
  if (!fileInput) {
    return;
  }

  try {
    suppressFileInputChange = true;
    if (multiTemplateSelectedFiles.length === 0) {
      fileInput.value = "";
    } else {
      const dataTransfer = new DataTransfer();
      multiTemplateSelectedFiles.forEach((file) => {
        try {
          dataTransfer.items.add(file);
        } catch (error) {
          console.warn("Unable to add file to DataTransfer", error);
        }
      });
      fileInput.files = dataTransfer.files;
    }
  } catch (error) {
    console.warn("Unable to synchronize multi-template selection with input", error);
  } finally {
    suppressFileInputChange = false;
    updateFileChooserSummary(multiTemplateSelectedFiles);
  }
}

function clearMultiTemplateSelection(options = {}) {
  const { skipInputSync = false } = options;
  multiTemplateSelectedFiles.length = 0;
  multiTemplateSelectionIndex.clear();
  if (!skipInputSync) {
    syncMultiTemplateSelectionToInput();
  }
}

function mergeMultiTemplateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return false;
  }

  let changed = false;
  files.forEach((file) => {
    if (!file) {
      return;
    }
    const signature = getFileSignature(file);
    if (!signature) {
      return;
    }
    const existingIndex = multiTemplateSelectionIndex.get(signature);
    if (existingIndex == null) {
      multiTemplateSelectionIndex.set(signature, multiTemplateSelectedFiles.length);
      multiTemplateSelectedFiles.push(file);
      changed = true;
    } else {
      multiTemplateSelectedFiles[existingIndex] = file;
      changed = true;
    }
  });

  return changed;
}

async function loadSingleFormFile(file) {
  if (!file) {
    previousTemplateFileKeys = [];
    resetState();
    return;
  }

  currentFile = file;

  if (batchTextarea) {
    batchTextarea.value = "";
  }
  if (batchFileInput) {
    batchFileInput.value = "";
  }

  batchEdited = false;
  setStatus(formFillLocale.loading, "info");
  toggleInputs(false);

  try {
    const fields = await fetchFields(file);
    renderFields(fields);
    const usableFields = fields.filter((field) => FILLABLE_TYPES.has(field.type));
    if (usableFields.length === 0) {
      setStatus(formFillLocale.noFields, "warning");
      downloadButton.disabled = false;
      batchButton.disabled = true;
    } else {
      setStatus(formFillLocale.ready, "success");
      downloadButton.disabled = false;
      updateBatchButtonState({ silent: true });
    }
    previousTemplateFileKeys = [getFileSignature(file)];
  } catch (error) {
    console.error(error);
    setStatus(formFillLocale.requestError, "danger");
    resetFieldSection();
  } finally {
    toggleInputs(true);
  }
}

fileInput?.addEventListener("change", async (event) => {
  if (suppressFileInputChange) {
    return;
  }

  const files = Array.from(event.target.files ?? []);
  const primaryFile = files[0] ?? null;
  const multiMode = isMultiTemplateMode();

  if (!multiMode) {
    clearMultiTemplateSelection({ skipInputSync: true });
    await loadSingleFormFile(primaryFile);
    return;
  }

  if (batchFileInput) {
    batchFileInput.value = "";
  }

  if (files.length === 0) {
    if (multiTemplateSelectedFiles.length === 0) {
      previousTemplateFileKeys = [];
      clearMultiTemplateSelection();
      resetState();
    } else {
      syncMultiTemplateSelectionToInput();
    }
    return;
  }

  mergeMultiTemplateFiles(files);
  syncMultiTemplateSelectionToInput();

  if (multiTemplateSelectedFiles.length === 0) {
    previousTemplateFileKeys = [];
    resetState();
    return;
  }

  currentFile = multiTemplateSelectedFiles[0] ?? null;

  setStatus(formFillLocale.loading, "info");
  toggleInputs(false);
  resetFieldSection();
  try {
    const records = await buildMultiTemplateRecords(multiTemplateSelectedFiles);
    previousTemplateFileKeys = multiTemplateSelectedFiles.map((file) =>
      getFileSignature(file)
    );
    if (records.length > 0) {
      if (batchTextarea) {
        batchTextarea.value = JSON.stringify(records, null, 2);
      }
      batchEdited = false;
      setStatus(
        formFillLocale.multiTemplateReady ?? formFillLocale.batchReady,
        "success"
      );
    } else if (batchTextarea) {
      batchTextarea.value = "";
      setStatus(formFillLocale.batchEmpty, "info");
    }
    downloadButton.disabled = false;
    updateBatchButtonState({ silent: true });
  } catch (error) {
    console.error(error);
    setStatus(formFillLocale.requestError, "danger");
  } finally {
    toggleInputs(true);
  }
});

batchTextarea?.addEventListener("input", () => {
  if (batchFileInput) {
    batchFileInput.value = "";
  }
  batchEdited = true;
  updateBatchButtonState();
});

batchFileInput?.addEventListener("change", async () => {
  batchEdited = false;
  const file = batchFileInput.files?.[0];
  if (!file) {
    updateBatchButtonState({ silent: true });
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setStatus(formFillLocale.batchEmpty, "warning");
      batchTextarea && (batchTextarea.value = "");
      batchButton.disabled = true;
      return;
    }

    if (batchTextarea) {
      batchTextarea.value = JSON.stringify(parsed, null, 2);
    }
    batchEdited = true;
    setStatus(formFillLocale.batchFileReady ?? formFillLocale.batchReady, "success");
  } catch (error) {
    console.error("Unable to load batch JSON file", error);
    if (batchTextarea) {
      batchTextarea.value = "";
    }
    setStatus(formFillLocale.parsingError, "danger");
    batchButton.disabled = true;
  } finally {
    batchFileInput.value = "";
    updateBatchButtonState({ silent: true });
  }
});

multiTemplateToggle?.addEventListener("change", () => {
  const enabled = multiTemplateToggle.checked;
  if (fileInput) {
    fileInput.multiple = enabled;
  }

  if (enabled) {
    const currentSelection = Array.from(fileInput?.files ?? []);
    if (currentSelection.length > 0) {
      mergeMultiTemplateFiles(currentSelection);
      syncMultiTemplateSelectionToInput();
    }
  } else {
    clearMultiTemplateSelection({ skipInputSync: true });
  }

  if (!enabled && fileInput?.files?.length > 1) {
    const selection = Array.from(fileInput.files);
    const primary = selection[0];
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(primary);
      fileInput.files = dataTransfer.files;
    } catch (error) {
      console.warn(
        "Unable to trim file selection when disabling multi-template mode",
        error
      );
      clearFileSelection();
      resetState();
    }
    currentFile = primary ?? null;
  }

  if (!enabled) {
    previousTemplateFileKeys = [];
  }

  if (hasSelectedFormFile()) {
    const syntheticChange = new CustomEvent("change", {
      detail: { source: "programmatic" },
    });
    fileInput.dispatchEvent(syntheticChange);
  } else {
    updateBatchButtonState({ silent: true });
  }
});

flattenToggle?.addEventListener("change", () => {
  updateBatchButtonState({ silent: true });
});

downloadButton?.addEventListener("click", async () => {
  if (!hasSelectedFormFile()) {
    setStatus(formFillLocale.selectFile, "warning");
    return;
  }
  await performDownload(false);
});

batchButton?.addEventListener("click", async () => {
  if (!hasSelectedFormFile()) {
    setStatus(formFillLocale.selectFile, "warning");
    return;
  }
  await performDownload(true);
});

function resetState() {
  currentFile = null;
  resetFieldSection();
  downloadButton.disabled = true;
  batchButton.disabled = true;
  clearMultiTemplateSelection({ skipInputSync: true });
  clearFileSelection();
  clearFieldOrdering();
  if (batchTextarea) {
    batchTextarea.value = "";
  }
  if (batchFileInput) {
    batchFileInput.value = "";
  }
  batchEdited = false;
  setStatus(formFillLocale.selectFile, "info");
}

function resetFieldSection() {
  fieldsForm.classList.add("d-none");
  fieldsForm.innerHTML = "";
  fieldValidationRegistry.clear();
  retainedFieldValues.clear();
}

async function fetchFields(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/v1/form/fields", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch fields: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
}

function renderFields(fields) {
  const fieldsForDisplay = normalizeFieldsForDisplay(fields);
  const orderedFields = applyStableFieldOrdering(fieldsForDisplay);

  fieldsForm.innerHTML = "";
  fieldValidationRegistry.clear();
  fieldMetadata.clear();
  if (!Array.isArray(orderedFields) || orderedFields.length === 0) {
    clearFieldOrdering();
    resetFieldSection();
    if (!batchEdited && batchTextarea) {
      batchTextarea.value = "";
    }
    return;
  }

  fieldsForm.classList.remove("d-none");

  const displayedNames = new Set();
  orderedFields.forEach((field, index) => {
    const metadataKey = buildFieldMetadataKey(field, index);
    fieldMetadata.set(metadataKey, {
      ...field,
      key: metadataKey,
      index,
      multiSelect: Boolean(field.multiSelect),
    });
    if (field?.name) {
      displayedNames.add(field.name);
    }
    const group = buildFieldGroup(field, index, metadataKey);
    fieldsForm.appendChild(group);
  });

  for (const name of Array.from(retainedFieldValues.keys())) {
    if (!displayedNames.has(name)) {
      retainedFieldValues.delete(name);
    }
  }
    populateBatchTemplate(orderedFields);
  populateBatchTemplate(fieldsForDisplay);
}

function buildFieldGroup(field, index, metadataKey) {
  const isCheckbox = field.type === "checkbox";
  const wrapper = document.createElement("div");
  wrapper.className = isCheckbox ? "form-check ms-3 mb-3" : "mb-3";
  if (metadataKey) {
    wrapper.dataset.fieldKey = metadataKey;
  }

  const inputId = `formField_${index}`;
  const input = buildInputForField(field, inputId);

  if (!input) {
    const note = document.createElement("div");
    note.className = "form-text text-muted";
    note.textContent = `${formFillLocale.unsupportedField}: ${field.type}`;
    wrapper.appendChild(note);
    return wrapper;
  }

  applyRetainedValueToInput(input, field);

  const label = document.createElement("label");
  if (!isCheckbox) {
    label.className = "form-label";
  }
  label.setAttribute("for", inputId);
  label.textContent = field.label ?? field.name;

  if (field.required) {
    const requiredMark = document.createElement("span");
    requiredMark.className = "text-danger ms-1";
    requiredMark.textContent = "*";
    label.appendChild(requiredMark);
  }

  if (field.tooltip) {
    label.title = field.tooltip;
    input.title = field.tooltip;
  }

  if (field.required) {
    input.required = true;
    input.setAttribute("aria-required", "true");
  }

  if (isCheckbox) {
    wrapper.appendChild(input);
    wrapper.appendChild(label);
  } else {
    wrapper.appendChild(label);
    wrapper.appendChild(input);
  }

  appendFieldDetails(wrapper, field, metadataKey);
  setupInlineValidation(input, field, wrapper);
  registerInputRetention(input, field);
  return wrapper;
}

function appendFieldDetails(wrapper, field, metadataKey) {
  if (typeof field.pageIndex === "number" && field.pageIndex >= 0) {
    const pageHint = document.createElement("div");
    pageHint.className = "form-text";
    pageHint.textContent = `${formFillLocale.pageLabel ?? "Page"} ${field.pageIndex + 1}`;
    wrapper.appendChild(pageHint);
  }
  if (field.tooltip) {
    const tooltip = document.createElement("div");
    tooltip.className = "form-text text-muted";
    tooltip.textContent = field.tooltip;
    wrapper.appendChild(tooltip);
  }
  if (field.name) {
    const keyHint = document.createElement("div");
    keyHint.className = "form-text text-muted";
    const code = document.createElement("code");
    code.textContent = field.name;
    const keyLabel = formFillLocale.keyLabel ?? "Key";
    keyHint.append(`${keyLabel}: `, code);
    wrapper.appendChild(keyHint);
  }

  const actions = createFieldActions(field, metadataKey);
  if (actions) {
    wrapper.appendChild(actions);
  }
}

function createFieldActions(field, metadataKey) {
  if (!metadataKey || !field?.name || isMultiTemplateMode()) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "d-flex align-items-center gap-2 mt-2 field-action-row";
  container.setAttribute("role", "group");

  const fieldKey = metadataKey;
  const displayLabel = field.label || field.name;

  if (editModal && editForm && MODIFIABLE_FIELD_TYPES.has(field.type)) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1";
    editButton.title = formFillLocale.editField ?? "Edit field";
    editButton.dataset.fieldKey = fieldKey;
    editButton.innerHTML =
      '<span class="material-symbols-rounded" aria-hidden="true">edit</span><span class="visually-hidden">' +
      (displayLabel || field.name) +
      '</span>';
    editButton.addEventListener("click", () => {
      handleEditField(fieldKey);
    });
    container.appendChild(editButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className =
    "btn btn-link btn-sm text-danger p-0 d-inline-flex align-items-center gap-1";
  deleteButton.title = formFillLocale.deleteField ?? "Delete field";
  deleteButton.dataset.fieldKey = fieldKey;
  deleteButton.innerHTML =
    '<span class="material-symbols-rounded" aria-hidden="true">delete</span><span class="visually-hidden">' +
    (displayLabel || field.name) +
    '</span>';
  deleteButton.addEventListener("click", () => {
    handleDeleteField(fieldKey);
  });
  container.appendChild(deleteButton);

  return container;
}

function lookupFieldMetadata(fieldKey) {
  if (!fieldKey) {
    return null;
  }
  return fieldMetadata.get(fieldKey) ?? null;
}

function handleEditField(fieldKey) {
  if (!editModal || !editForm) {
    setStatus(formFillLocale.editUnavailable ?? formFillLocale.requestError, "warning");
    return;
  }
  if (isMultiTemplateMode()) {
    setStatus(formFillLocale.editMultiDisabled ?? formFillLocale.selectFile, "warning");
    return;
  }

  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata) {
    setStatus(formFillLocale.editMissing ?? formFillLocale.requestError, "warning");
    return;
  }

  if (!MODIFIABLE_FIELD_TYPES.has(metadata.type)) {
    setStatus(formFillLocale.editUnsupported ?? formFillLocale.requestError, "warning");
    return;
  }

  populateEditForm(metadata);
  try {
    editModal.show();
  } catch (error) {
    console.error("Failed to show edit modal", error);
    setStatus(formFillLocale.requestError, "danger");
  }
}

async function handleDeleteField(fieldKey) {
  if (isMultiTemplateMode()) {
    setStatus(formFillLocale.editMultiDisabled ?? formFillLocale.selectFile, "warning");
    return;
  }

  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata?.name) {
    setStatus(formFillLocale.deleteMissing ?? formFillLocale.requestError, "warning");
    return;
  }

  if (!currentFile) {
    setStatus(formFillLocale.selectFile, "warning");
    return;
  }

  const displayLabel = metadata.label || metadata.name;
  const confirmTemplate =
    formFillLocale.deleteConfirm ?? 'Delete "{0}"? This action cannot be undone.';
  const confirmationMessage = confirmTemplate.replace("{0}", displayLabel);
  const confirmed = window.confirm(confirmationMessage);
  if (!confirmed) {
    return;
  }

  const success = await mutatePdf(
    "/api/v1/form/delete-fields",
    "names",
    JSON.stringify([metadata.name]),
    formFillLocale.deleteSuccess ?? formFillLocale.ready,
    formFillLocale.deleting ?? formFillLocale.loading
  );

  if (success && metadata.name) {
    pendingRemovalNames.add(metadata.name);
    removeRetainedValue(metadata.name);
  }
}

function populateEditForm(metadata) {
  if (!editInputs || !metadata) {
    return;
  }

  editingFieldName = metadata.name;
  if (editForm) {
    editForm.dataset.fieldKey = metadata.key ?? metadata.name ?? "";
  }

  const resolvedType = MODIFIABLE_FIELD_TYPES.has(metadata.type)
    ? metadata.type
    : "text";

  if (editInputs.type) {
    editInputs.type.value = resolvedType;
  }

  updateEditTypeControls(resolvedType);

  if (editInputs.name) {
    editInputs.name.value = metadata.name ?? "";
  }
  if (editInputs.label) {
    editInputs.label.value = metadata.label ?? "";
  }
  if (editInputs.defaultValue) {
    editInputs.defaultValue.value = metadata.value ?? "";
  }
  if (editInputs.required) {
    editInputs.required.checked = Boolean(metadata.required);
  }
  if (editInputs.tooltip) {
    editInputs.tooltip.value = metadata.tooltip ?? "";
  }
  if (editInputs.options) {
    const options = Array.isArray(metadata.options) ? metadata.options : [];
    editInputs.options.value = options.join("\n");
  }
  if (editInputs.multiSelect) {
    editInputs.multiSelect.checked = Boolean(metadata.multiSelect);
  }
}

function resetEditForm() {
  if (!editInputs) {
    return;
  }
  editingFieldName = null;
  if (editForm) {
    delete editForm.dataset.fieldKey;
  }
  if (editInputs.type) {
    editInputs.type.value = "text";
  }
  if (editInputs.name) {
    editInputs.name.value = "";
  }
  if (editInputs.label) {
    editInputs.label.value = "";
  }
  if (editInputs.defaultValue) {
    editInputs.defaultValue.value = "";
  }
  if (editInputs.options) {
    editInputs.options.value = "";
  }
  if (editInputs.tooltip) {
    editInputs.tooltip.value = "";
  }
  if (editInputs.required) {
    editInputs.required.checked = false;
  }
  if (editInputs.multiSelect) {
    editInputs.multiSelect.checked = false;
  }
  updateEditTypeControls(editInputs.type?.value ?? "text");
}

function updateEditTypeControls(type) {
  const normalized = type ?? "text";
  const hasOptions = OPTION_FIELD_TYPES.has(normalized);

  if (editInputs.optionsGroup) {
    editInputs.optionsGroup.classList.toggle("d-none", !hasOptions);
  }
  if (editInputs.options) {
    editInputs.options.disabled = !hasOptions;
  }

  const isListBox = normalized === "listbox";
  if (editInputs.multiSelectGroup) {
    editInputs.multiSelectGroup.classList.toggle("d-none", !isListBox);
  }
  if (editInputs.multiSelect) {
    editInputs.multiSelect.disabled = !isListBox;
  }

  if (editInputs.defaultValue) {
    if (normalized === "checkbox") {
      editInputs.defaultValue.placeholder =
        formFillLocale.checkboxDefaultHint ?? "true or false";
    } else if (normalized === "listbox") {
      editInputs.defaultValue.placeholder =
        formFillLocale.listboxDefaultHint ?? "Option 1, Option 2";
    } else {
      editInputs.defaultValue.placeholder = "";
    }
  }
}

function collectModificationPayload(metadata) {
  if (!metadata?.name) {
    return null;
  }

  const type = editInputs.type?.value ?? metadata.type ?? "text";

  const payload = {
    targetName: metadata.name,
    name: sanitizeFieldName(editInputs.name?.value, metadata.name),
    label: sanitizeOptionalText(editInputs.label?.value),
    type,
    required: Boolean(editInputs.required?.checked),
    tooltip: sanitizeOptionalText(editInputs.tooltip?.value),
  };

  if (OPTION_FIELD_TYPES.has(type)) {
    const options = parseOptionsInput(editInputs.options?.value ?? "");
    payload.options = options.length > 0 ? options : [];
  }

  let listMultiSelect = false;
  if (type === "listbox") {
    listMultiSelect = Boolean(editInputs.multiSelect?.checked);
    payload.multiSelect = listMultiSelect;
  }

  const defaultValue = computeDefaultValue(
    type,
    editInputs.defaultValue?.value ?? "",
    { listMultiSelect }
  );
  if (defaultValue !== undefined) {
    payload.defaultValue = defaultValue;
  }

  return payload;
}

function sanitizeFieldName(value, fallback) {
  const trimmed = (value ?? "").trim();
  if (trimmed) {
    return trimmed;
  }
  return fallback ?? "";
}

function sanitizeOptionalText(value) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionsInput(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function computeDefaultValue(type, rawValue, options = {}) {
  const { listMultiSelect = false } = options;
  if (type === "checkbox") {
    const normalized = (rawValue ?? "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }
    if (["true", "yes", "1", "on"].includes(normalized)) {
      return "true";
    }
    if (["false", "no", "0", "off"].includes(normalized)) {
      return "false";
    }
    return normalized;
  }

  if (type === "listbox") {
    const selections = parseOptionsInput(rawValue);
    if (selections.length === 0) {
      return "";
    }
    if (listMultiSelect) {
      return selections.join(",");
    }
    return selections[0];
  }

  return rawValue ?? "";
}

async function mutatePdf(endpoint, payloadKey, payloadValue, successMessage, statusMessage) {
  if (!currentFile) {
    setStatus(formFillLocale.selectFile, "warning");
    return false;
  }

  const formData = new FormData();
  formData.append("file", currentFile);
  formData.append(payloadKey, payloadValue);

  toggleInputs(false);
  if (statusMessage) {
    setStatus(statusMessage, "info");
  }

  let success = false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }

    const blob = await response.blob();
    await refreshFormPreviewFromBlob(blob, currentFile?.name, successMessage);
    success = true;
  } catch (error) {
    console.error(error);
    const message = error?.message || formFillLocale.requestError;
    setStatus(message, "danger");
  } finally {
    toggleInputs(true);
  }

  return success;
}

async function refreshFormPreviewFromBlob(blob, originalName, successMessage) {
  const filename = originalName || "updated.pdf";
  const newFile = new File([blob], filename, {
    type: "application/pdf",
    lastModified: Date.now(),
  });

  synchronizeFileInput(newFile);
  await loadSingleFormFile(newFile);

  if (successMessage) {
    setStatus(successMessage, "success");
  }
}

function synchronizeFileInput(file) {
  if (!fileInput || !file) {
    return;
  }

  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
  } catch (error) {
    console.warn("Unable to synchronize file input with updated PDF", error);
  }

  if (fileChooser) {
    updateFileChooserSummary([file]);
  }
}

async function submitEditForm(event) {
  event?.preventDefault?.();
  if (!editForm) {
    return;
  }

  if (isMultiTemplateMode()) {
    setStatus(formFillLocale.editMultiDisabled ?? formFillLocale.selectFile, "warning");
    return;
  }

  const fieldKey = editForm.dataset.fieldKey;
  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata) {
    setStatus(formFillLocale.editMissing ?? formFillLocale.requestError, "warning");
    return;
  }

  const payload = collectModificationPayload(metadata);
  if (!payload) {
    setStatus(formFillLocale.editMissing ?? formFillLocale.requestError, "warning");
    return;
  }

  const success = await mutatePdf(
    "/api/v1/form/modify-fields",
    "updates",
    JSON.stringify([payload]),
    formFillLocale.modifySuccess ?? formFillLocale.ready,
    formFillLocale.updating ?? formFillLocale.loading
  );

  if (success) {
    const targetName = payload.targetName;
    const replacementName = payload.name ?? targetName;
    if (targetName && replacementName && targetName !== replacementName) {
      pendingRemovalNames.add(targetName);
      renameRetainedValue(targetName, replacementName);
    }
  }

  if (success && editModal) {
    editModal.hide();
  }
}

function setupInlineValidation(input, field, wrapper) {
  if (!input || !field) {
    return;
  }

  const constraints = buildValidationConstraints(field, input);
  if (!constraints) {
    return;
  }

  const messageEl = document.createElement("div");
  messageEl.className = "invalid-feedback d-block small";
  messageEl.style.display = "none";
  if (input.type === "checkbox") {
    messageEl.classList.add("ms-4");
  }
  wrapper.appendChild(messageEl);

  const entry = {
    constraints,
    messageEl,
    touched: false,
    invalid: false,
  };

  fieldValidationRegistry.set(input, entry);

  const handleChange = () => {
    entry.touched = true;
    validateField(input);
  };

  input.addEventListener("input", handleChange);
  input.addEventListener("change", handleChange);
  input.addEventListener("blur", () => {
    entry.touched = true;
    validateField(input, { force: true });
  });
}

function registerInputRetention(input, field) {
  if (!input || !field?.name) {
    return;
  }

  const fieldName = field.name;
  const storeValue = () => {
    const snapshot = snapshotInputForRetention(input);
    if (snapshot) {
      retainedFieldValues.set(fieldName, snapshot);
    } else {
      retainedFieldValues.delete(fieldName);
    }
  };

  input.addEventListener("input", storeValue);
  input.addEventListener("change", storeValue);
}

function snapshotInputForRetention(input) {
  if (!input || typeof input.name !== "string") {
    return null;
  }

  if (input.type === "checkbox") {
    return { kind: "checkbox", value: Boolean(input.checked) };
  }

  if (input.multiple) {
    const values = Array.from(input.selectedOptions || []).map((option) => option.value);
    return { kind: "multiple", value: values };
  }

  if (input.tagName === "SELECT") {
    return { kind: "select", value: input.value ?? "" };
  }

  return { kind: "text", value: input.value ?? "" };
}

function inferRetentionDescriptor(input, retained) {
  if (retained && typeof retained === "object" && "kind" in retained) {
    return retained;
  }

  if (input.type === "checkbox") {
    return { kind: "checkbox", value: Boolean(retained) };
  }

  if (input.multiple) {
    const values = Array.isArray(retained)
      ? retained
      : typeof retained === "string" && retained
      ? retained.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
      : [];
    return { kind: "multiple", value: values };
  }

  if (input.tagName === "SELECT") {
    return { kind: "select", value: retained ?? "" };
  }

  return { kind: "text", value: retained ?? "" };
}

function applyRetainedValueToInput(input, field) {
  if (!input || !field?.name) {
    return;
  }

  const retained = retainedFieldValues.get(field.name);
  if (!retained) {
    return;
  }

  const descriptor = inferRetentionDescriptor(input, retained);
  switch (descriptor.kind) {
    case "checkbox":
      input.checked = Boolean(descriptor.value);
      break;
    case "multiple": {
      const values = Array.isArray(descriptor.value)
        ? descriptor.value.map((value) => String(value))
        : [];
      const valueSet = new Set(values);
      let applied = 0;
      Array.from(input.options || []).forEach((option) => {
        const selected = valueSet.has(option.value);
        option.selected = selected;
        if (selected) {
          applied += 1;
        }
      });
      if (values.length > 0 && applied === 0) {
        retainedFieldValues.delete(field.name);
      }
      break;
    }
    case "select": {
      const value = descriptor.value ?? "";
      const options = Array.from(input.options || []);
      const canApply =
        value === "" || options.some((option) => option.value === value);
      if (canApply) {
        input.value = value;
      } else {
        retainedFieldValues.delete(field.name);
      }
      break;
    }
    default:
      input.value = descriptor.value ?? "";
      break;
  }
}

function removeRetainedValue(fieldName) {
  if (!fieldName) {
    return;
  }
  retainedFieldValues.delete(fieldName);
}

function renameRetainedValue(oldName, newName) {
  if (!oldName || !newName || oldName === newName) {
    return;
  }
  if (!retainedFieldValues.has(oldName)) {
    return;
  }
  const retained = retainedFieldValues.get(oldName);
  retainedFieldValues.delete(oldName);
  retainedFieldValues.set(newName, retained);
}

function buildValidationConstraints(field, input) {
  const constraints = {
    required: Boolean(field.required),
    checkbox: input.type === "checkbox",
    multiple: Boolean(input.multiple),
    dateLike: field.type === "text" && isDateField(field),
    emailLike: field.type === "text" && isEmailField(field),
  };

  if (input.type === "date") {
    constraints.dateLike = true;
  }

  if (
    !constraints.required &&
    !constraints.dateLike &&
    !constraints.emailLike &&
    !constraints.multiple &&
    !constraints.checkbox
  ) {
    return null;
  }

  return constraints;
}

function validateField(input, options = {}) {
  const entry = fieldValidationRegistry.get(input);
  if (!entry) {
    return true;
  }
  if (!document.body.contains(input)) {
    fieldValidationRegistry.delete(input);
    return true;
  }

  const { constraints, messageEl } = entry;
  const { force = false } = options;
  const { value, isEmpty } = extractValueForValidation(input, constraints);

  let error = "";
  if (constraints.required && isEmpty) {
    if (constraints.multiple) {
      error = formFillLocale.validationSelect ?? formFillLocale.validationRequired;
    } else {
      error = formFillLocale.validationRequired;
    }
  }

  if (!error && constraints.dateLike && !isEmpty) {
    const normalized = toISODate(String(value));
    if (!normalized) {
      error = formFillLocale.validationDate ?? formFillLocale.validationInvalid;
    }
  }

  if (!error && constraints.emailLike && !isEmpty) {
    if (!EMAIL_REGEX.test(String(value).trim())) {
      error = formFillLocale.validationEmail ?? formFillLocale.validationInvalid;
    }
  }

  entry.invalid = Boolean(error);
  const shouldShow = entry.touched || force;

  if (entry.invalid && shouldShow) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
    messageEl.textContent = error || formFillLocale.validationInvalid;
    messageEl.style.display = "";
  } else {
    input.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
    messageEl.textContent = "";
    messageEl.style.display = "none";
  }

  return !entry.invalid;
}

function validateAllFields(options = {}) {
  if (fieldValidationRegistry.size === 0) {
    return true;
  }

  const { focus = true } = options;
  let firstInvalid = null;

  for (const input of fieldValidationRegistry.keys()) {
    const valid = validateField(input, { force: true });
    if (!valid && !firstInvalid) {
      firstInvalid = input;
    }
  }

  if (firstInvalid && focus) {
    firstInvalid.focus({ preventScroll: false });
  }

  return !firstInvalid;
}

function extractValueForValidation(input, constraints) {
  if (constraints.checkbox) {
    const checked = Boolean(input.checked);
    return { value: checked, isEmpty: !checked };
  }

  if (constraints.multiple) {
    const values = Array.from(input.selectedOptions || [])
      .map((option) => option.value?.trim())
      .filter((val) => val);
    return { value: values, isEmpty: values.length === 0 };
  }

  let value = input.value?.trim() ?? "";
  if (!value && input.dataset.originalValue) {
    value = String(input.dataset.originalValue).trim();
  }
  return { value, isEmpty: value.length === 0 };
}

function isEmailField(field) {
  if (!field || field.type !== "text") {
    return false;
  }
  const haystack = collectFieldHaystack(field);
  if (!haystack) {
    return false;
  }
  return EMAIL_FIELD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function collectFieldHaystack(field) {
  return [field.label, field.name, field.tooltip]
    .filter(Boolean)
    .map((value) => value.toString())
    .join(" ");
}

function buildInputForField(field, inputId) {
  if (!field || !field.name) {
    return null;
  }
  if (!FILLABLE_TYPES.has(field.type)) {
    return null;
  }

  let element;
  let dateLike = false;
  const currentValue = field.value ?? "";

  switch (field.type) {
    case "text":
      dateLike = isDateField(field);
      element = document.createElement("input");
      element.type = dateLike ? "date" : "text";
      element.className = "form-control";
      if (dateLike) {
        const isoValue = toISODate(currentValue);
        if (isoValue) {
          element.value = isoValue;
        } else {
          element.value = "";
          if (currentValue) {
            element.placeholder = currentValue;
            element.dataset.originalValue = currentValue;
          }
        }
        element.autocomplete = "bday";
      } else {
        element.value = currentValue;
        element.autocomplete = "off";
      }
      break;
    case "checkbox":
      element = document.createElement("input");
      element.type = "checkbox";
      element.checked = isTruthy(currentValue);
      break;
    case "radio":
    case "combobox":
      element = document.createElement("select");
      element.className = "form-select";
      addOptionsToSelect(element, field.options, currentValue);
      break;
    case "listbox":
      element = document.createElement("select");
      element.className = "form-select";
      element.multiple = field.multiSelect !== undefined ? Boolean(field.multiSelect) : true;
      if (Array.isArray(field.options) && field.options.length > 0) {
        const defaultSize = Math.min(6, Math.max(3, field.options.length));
        element.size = element.multiple ? defaultSize : Math.min(defaultSize, field.options.length);
      }
      addOptionsToSelect(element, field.options, currentValue, element.multiple);
      break;
    default:
      return null;
  }

  element.id = inputId;
  element.name = field.name;
  element.dataset.fieldName = field.name;
  return element;
}

function addOptionsToSelect(selectEl, options, currentValue, allowMultiple = false) {
  selectEl.innerHTML = "";
  const values = normalizeValueCollection(currentValue, allowMultiple);

  if (!Array.isArray(options) || options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "";
    selectEl.appendChild(option);
    return;
  }

  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    if (values.includes(opt)) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  });
}

function populateBatchTemplate(fields) {
  if (!batchTextarea) {
    return;
  }

  if (batchEdited) {
    return;
  }

  const templateRecord = createTemplateRecordFromFields(fields);
  if (!isPlainObject(templateRecord) || Object.keys(templateRecord).length === 0) {
    batchTextarea.value = "";
    return;
  }

  batchTextarea.value = JSON.stringify([templateRecord], null, 2);
  batchEdited = false;
  updateBatchButtonState({ silent: true });
}

function createTemplateRecordFromFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return {};
  }

  const fillable = fields.filter(
    (field) => field?.name && FILLABLE_TYPES.has(field.type)
  );

  if (fillable.length === 0) {
    return {};
  }

  const templateRecord = {};
  fillable.forEach((field) => {
    templateRecord[field.name] = inferTemplateValue(field);
  });
  return templateRecord;
}

function buildFieldMetadataKey(field, index) {
  const baseName = (field?.name && String(field.name).trim()) || `field_${index}`;
  return `${baseName}__${index}`;
}

function normalizeFieldsForDisplay(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return [];
  }

  const filtered = [];
  const indexByName = new Map();
  const namesEncountered = new Set();

  fields.forEach((field) => {
    const name = typeof field?.name === "string" ? field.name : null;
    if (name) {
      namesEncountered.add(name);
      if (pendingRemovalNames.has(name)) {
        return;
      }
    }

    if (name && indexByName.has(name)) {
      const existingIndex = indexByName.get(name);
      filtered[existingIndex] = field;
    } else {
      if (name) {
        indexByName.set(name, filtered.length);
      }
      filtered.push(field);
    }
  });

  for (const name of Array.from(pendingRemovalNames)) {
    if (!namesEncountered.has(name)) {
      pendingRemovalNames.delete(name);
    }
  }

  return filtered;
}

function applyStableFieldOrdering(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    fieldOrdinalOrder.clear();
    nextFieldOrdinalValue = 0;
    return [];
  }

  const entries = fields.map((field, index) => {
    const key = resolveFieldOrderKey(field, index);
    if (!fieldOrdinalOrder.has(key)) {
      fieldOrdinalOrder.set(key, nextFieldOrdinalValue++);
    }
    return {
      field,
      key,
      order: fieldOrdinalOrder.get(key),
    };
  });

  const currentKeys = new Set(entries.map((entry) => entry.key));
  for (const existingKey of Array.from(fieldOrdinalOrder.keys())) {
    if (!currentKeys.has(existingKey)) {
      fieldOrdinalOrder.delete(existingKey);
    }
  }
  if (fieldOrdinalOrder.size === 0) {
    nextFieldOrdinalValue = 0;
  }

  entries.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    const pageCompare = compareMaybeNumeric(a.field?.pageIndex, b.field?.pageIndex);
    if (pageCompare !== 0) {
      return pageCompare;
    }
    return (a.field?.name || "").localeCompare(b.field?.name || "", undefined, {
      sensitivity: "base",
    });
  });

  return entries.map((entry) => entry.field);
}

function resolveFieldOrderKey(field, fallbackIndex = 0) {
  if (!field || typeof field !== "object") {
    return `unknown::${fallbackIndex}`;
  }

  const pageIndex = toNumericOrNull(field.pageIndex);
  const pageOrder = toNumericOrNull(field.pageOrder);
  if (pageIndex !== null && pageOrder !== null) {
    return `page:${pageIndex}|order:${pageOrder}`;
  }

  if (typeof field.name === "string" && field.name.trim().length > 0) {
    return `name:${field.name}|page:${pageIndex ?? "na"}`;
  }

  if (typeof field.label === "string" && field.label.trim().length > 0) {
    return `label:${field.label}|page:${pageIndex ?? "na"}`;
  }

  return `fallback:${pageIndex ?? "na"}|${fallbackIndex}`;
}

function toNumericOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareMaybeNumeric(a, b) {
  const numericA = toNumericOrNull(a);
  const numericB = toNumericOrNull(b);
  if (numericA === null && numericB === null) {
    return 0;
  }
  if (numericA === null) {
    return 1;
  }
  if (numericB === null) {
    return -1;
  }
  return numericA - numericB;
}

function clearFieldOrdering() {
  fieldOrdinalOrder.clear();
  nextFieldOrdinalValue = 0;
}

async function buildMultiTemplateRecords(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const existingRecords = readExistingBatchRecords();
  const previousRecordMap = new Map();
  const limit = Math.min(previousTemplateFileKeys.length, existingRecords.length);
  for (let index = 0; index < limit; index += 1) {
    const key = previousTemplateFileKeys[index];
    const record = existingRecords[index];
    if (!key || !isPlainObject(record)) {
      continue;
    }
    if (!previousRecordMap.has(key)) {
      previousRecordMap.set(key, []);
    }
    previousRecordMap.get(key).push(record);
  }

  const records = [];
  for (const file of files) {
    const signature = getFileSignature(file);
    if (!signature) {
      records.push({});
      continue;
    }

    const reuseQueue = previousRecordMap.get(signature);
    if (reuseQueue?.length) {
      const nextRecord = reuseQueue.shift();
      records.push({ ...(nextRecord ?? {}) });
      continue;
    }

    let templateRecord = multiTemplateRecordCache.get(signature);
    if (!templateRecord) {
      const fields = await fetchFields(file);
      templateRecord = createTemplateRecordFromFields(fields);
      multiTemplateRecordCache.set(signature, templateRecord);
    }

    records.push({ ...templateRecord });
  }

  return records;
}

function inferTemplateValue(field) {
  const rawValue = field?.value;
  switch (field?.type) {
    case "checkbox":
      return isTruthy(rawValue);
    case "listbox":
      return normalizeValueCollection(rawValue, true).join(", ");
    case "text":
      if (isDateField(field)) {
        return "2024-01-01";
      }
      return rawValue ?? "";
    default:
      return rawValue ?? "";
  }
}

function normalizeValueCollection(value, multiple) {
  if (value == null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && multiple) {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [value];
}

async function performDownload(isBatch) {
  if (!validateAllFields({ focus: true })) {
    setStatus(
      formFillLocale.validationFix ?? formFillLocale.validationRequired,
      "warning"
    );
    return;
  }
  try {
    toggleInputs(false);
    const formData = new FormData();
    const selectedFiles = getSelectedFormFiles();
    if (selectedFiles.length === 0) {
      setStatus(formFillLocale.selectFile, "warning");
      return;
    }

    if (isBatch) {
      selectedFiles.forEach((file) => {
        formData.append("file", file);
      });
    } else {
      formData.append("file", selectedFiles[0]);
    }
    formData.append("flatten", String(flattenToggle?.checked ?? false));

    if (isBatch) {
      const payload = parseBatchPayload();
      formData.append("records", JSON.stringify(payload));
      setStatus(formFillLocale.loading, "info");
      const response = await fetch("/api/v1/form/mail-merge", {
        method: "POST",
        body: formData,
      });
      await handleDownloadResponse(response, "form-merge.pdf");
    } else {
      const valueMap = collectFieldValues();
      formData.append("data", JSON.stringify(valueMap));
      setStatus(formFillLocale.loading, "info");
      const response = await fetch("/api/v1/form/fill", {
        method: "POST",
        body: formData,
      });
      await handleDownloadResponse(response, "form-filled.pdf");
    }

    setStatus(formFillLocale.ready, "success");
  } catch (error) {
    console.error(error);
    const message = (error && error.message) || "";
    if (message === "empty-batch" || message === "invalid-batch") {
      // Status already provided in parseBatchPayload
    } else if (error instanceof SyntaxError) {
      // parseBatchPayload will have provided feedback
    } else {
      setStatus(formFillLocale.requestError, "danger");
    }
  } finally {
    toggleInputs(true);
  }
}

function collectFieldValues() {
  const result = {};
  const inputs = fieldsForm.querySelectorAll("[data-field-name]");
  inputs.forEach((input) => {
    const fieldName = input.dataset.fieldName;
    if (!fieldName) return;

    if (input.type === "checkbox") {
      result[fieldName] = input.checked;
    } else if (input.multiple) {
      const values = Array.from(input.selectedOptions).map((option) => option.value);
      result[fieldName] = values.join(",");
    } else {
      const value = input.value || input.dataset.originalValue || "";
      result[fieldName] = value;
    }
  });
  return result;
}

function parseBatchPayload() {
  const raw = batchTextarea?.value ?? "";
  if (!raw.trim()) {
    setStatus(formFillLocale.batchEmpty, "warning");
    throw new Error("empty-batch");
  }
  try {
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload) || payload.length === 0) {
      setStatus(formFillLocale.batchEmpty, "warning");
      throw new Error("invalid-batch");
    }
    return payload;
  } catch (err) {
    setStatus(formFillLocale.parsingError, "danger");
    throw err;
  }
}

async function handleDownloadResponse(response, fallbackName) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("Content-Disposition")) ?? fallbackName;
  triggerDownload(blob, filename);
}

function extractFilename(disposition) {
  if (!disposition) return null;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch && asciiMatch[1]) {
    return asciiMatch[1];
  }
  return null;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function toggleInputs(enabled) {
  if (fileInput) fileInput.disabled = !enabled;
  if (fileChooser) {
    fileChooser.classList.toggle("disabled", !enabled);
    const browseButton = fileChooser.querySelector("input[type='file']");
    if (browseButton) {
      browseButton.disabled = !enabled;
    }
  }
  if (batchTextarea) batchTextarea.disabled = !enabled;
  if (batchFileInput) batchFileInput.disabled = !enabled;
  if (flattenToggle) flattenToggle.disabled = !enabled;

  if (downloadButton) {
    downloadButton.disabled = !enabled || !hasSelectedFormFile();
  }

  if (batchButton) {
    if (!enabled) {
      batchButton.disabled = true;
    } else {
      updateBatchButtonState({ silent: true });
    }
  }
}

function clearFileSelection() {
  if (fileInput) {
    try {
      fileInput.value = "";
    } catch (err) {
      console.warn("Unable to clear file input", err);
    }
  }
  if (fileChooser) {
    updateFileChooserSummary([]);
  }
}

function getSelectedFormFiles() {
  if (!fileInput?.files) {
    return [];
  }
  return Array.from(fileInput.files);
}

function hasSelectedFormFile() {
  return getSelectedFormFiles().length > 0;
}

function updateBatchButtonState(options = {}) {
  const { silent = false } = options;
  if (!hasSelectedFormFile()) {
    batchButton.disabled = true;
    return;
  }

  const raw = batchTextarea?.value ?? "";
  if (!raw.trim()) {
    if (!silent) setStatus(formFillLocale.batchEmpty, "info");
    batchButton.disabled = true;
    return;
  }
  try {
    const payload = JSON.parse(raw);
    if (Array.isArray(payload) && payload.length > 0) {
      batchButton.disabled = false;
      if (!silent) setStatus(formFillLocale.batchReady, "success");
    } else {
      batchButton.disabled = true;
      if (!silent) setStatus(formFillLocale.batchEmpty, "warning");
    }
  } catch (error) {
    batchButton.disabled = true;
    if (!silent) setStatus(formFillLocale.parsingError, "danger");
  }
}

function setStatus(message, variant = "info") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = STATUS_CLASSES[variant] ?? STATUS_CLASSES.info;
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["true", "yes", "1", "on", "checked"].includes(normalized);
}

function isDateField(field) {
  if (!field || field.type !== "text") {
    return false;
  }
  const haystack = collectFieldHaystack(field);
  if (!haystack) {
    return false;
  }
  return DATE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function toISODate(value) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const [, year, month, day] = compact;
    if (isValidDateParts(Number(year), Number(month), Number(day))) {
      return `${year}-${month}-${day}`;
    }
  }

  const separated = trimmed.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (separated) {
    const [, firstRaw, secondRaw, thirdRaw] = separated;
    if (firstRaw.length === 4) {
      const year = Number(firstRaw);
      const month = Number(secondRaw);
      const day = Number(thirdRaw);
      if (isValidDateParts(year, month, day)) {
        return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
      }
    }

    if (thirdRaw.length === 4) {
      const year = Number(thirdRaw);
      const firstNum = Number(firstRaw);
      const secondNum = Number(secondRaw);
      let month;
      let day;

      if (prefersDayFirst) {
        day = firstNum;
        month = secondNum;
        if (!isValidDateParts(year, month, day) && firstNum <= 12 && secondNum > 12) {
          day = secondNum;
          month = firstNum;
        }
      } else {
        month = firstNum;
        day = secondNum;
        if (!isValidDateParts(year, month, day) && firstNum > 12 && secondNum <= 12) {
          month = secondNum;
          day = firstNum;
        }
      }

      if (isValidDateParts(year, month, day)) {
        return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
      }
    }
  }

  const jsDate = new Date(trimmed);
  if (!Number.isNaN(jsDate.getTime())) {
    const year = jsDate.getUTCFullYear();
    const month = jsDate.getUTCMonth() + 1;
    const day = jsDate.getUTCDate();
    if (isValidDateParts(year, month, day)) {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
    }
  }

  return "";
}

function isValidDateParts(year, month, day) {
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return false;
  }
  if (year < 1900 || year > 2100) {
    return false;
  }
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1 || day > 31) {
    return false;
  }
  const constructed = new Date(Date.UTC(year, month - 1, day));
  return (
    constructed.getUTCFullYear() === year &&
    constructed.getUTCMonth() === month - 1 &&
    constructed.getUTCDate() === day
  );
}

function pad(value) {
  const str = String(value);
  if (str.length >= 2) {
    return str;
  }
  return str.padStart(2, "0");
}

if (statusEl && !statusEl.textContent) {
  setStatus(formFillLocale.selectFile, "info");
}

if (batchTextarea && !batchTextarea.placeholder) {
  batchTextarea.placeholder = DEFAULT_BATCH_PLACEHOLDER;
}
