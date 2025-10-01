const locale =
  typeof formFillLocale !== "undefined" && formFillLocale
    ? formFillLocale
    : {};

const dom = {
  fileInput: document.querySelector("input[name='formFillFile']"),
  fileChooser: document.querySelector(
    ".custom-file-chooser[data-bs-element-id='formFillFile-input']"
  ),
  status: document.getElementById("formFillStatus"),
  fieldsForm: document.getElementById("formFillFields"),
  downloadButton: document.getElementById("formFillDownload"),
  batchTextarea: document.getElementById("formFillBatchJson"),
  flattenToggle: document.getElementById("formFillFlatten"),
  editModalEl: document.getElementById("formFieldEditModal"),
  editForm: document.getElementById("formFieldEditForm"),
};

const {
  fileInput,
  fileChooser,
  status: statusEl,
  fieldsForm,
  downloadButton,
  batchTextarea,
  flattenToggle,
  editModalEl,
  editForm,
} = dom;

const editModal =
  editModalEl && window.bootstrap?.Modal
    ? new window.bootstrap.Modal(editModalEl, { backdrop: "static" })
    : null;

const state = {
  currentFile: null,
  fieldValidationRegistry: new Map(),
  fieldMetadata: new Map(),
  pendingRemovalNames: new Set(),
  retainedFieldValues: new Map(),
  fieldOrdinalOrder: new Map(),
  nextFieldOrdinalValue: 0,
};

const DEFAULT_JSON_PLACEHOLDER = '{"field":"value"}';
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

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneTemplateRecord(record) {
  if (!isPlainObject(record)) return {};
  try {
    return typeof structuredClone === "function"
      ? structuredClone(record)
      : JSON.parse(JSON.stringify(record));
  } catch {
    return { ...record };
  }
}

function normalizeFieldsResponse(data) {
  if (Array.isArray(data)) {
    return { fields: data, template: createTemplateRecordFromFields(data) };
  }
  if (isPlainObject(data)) {
    const fields = Array.isArray(data.fields) ? data.fields :
                   Array.isArray(data.data) ? data.data : [];
    const template = isPlainObject(data.template) ?
                     cloneTemplateRecord(data.template) :
                     createTemplateRecordFromFields(fields);
    return { fields, template };
  }
  return { fields: [], template: {} };
}

function resolveTemplateRecord(templateRecord, fields) {
  return isPlainObject(templateRecord) && Object.keys(templateRecord).length > 0
    ? cloneTemplateRecord(templateRecord)
    : createTemplateRecordFromFields(fields);
}

function updateFileChooserSummary(files) {
  const container = fileChooser?.querySelector(".selected-files");
  if (!container) return;

  if (!Array.isArray(files) || files.length === 0) {
    container.textContent = "";
    return;
  }

  container.textContent = files
    .map(file => file?.name || "")
    .filter(name => name.length > 0)
    .join(", ");
}

async function loadSingleFormFile(file) {
  if (!file) {
    resetState();
    return;
  }

  state.currentFile = file;

  if (batchTextarea) {
    batchTextarea.value = "";
  }
  setStatus(locale.loading, "info");
  toggleInputs(false);

  try {
    const { fields, template } = await fetchFields(file);
    renderFields(fields, template);
    const usableFields = fields.filter(field => FILLABLE_TYPES.has(field.type));
    if (usableFields.length === 0) {
      setStatus(locale.noFields, "warning");
      updateDownloadButtonVisibility();
    } else {
      setStatus(locale.ready, "success");
      updateDownloadButtonVisibility();
    }
  } catch (error) {
    console.error(error);
    setStatus(locale.requestError, "danger");
    resetFieldSection();
  } finally {
    toggleInputs(true);
  }
}

function resetState() {
  state.currentFile = null;
  resetFieldSection();
  if (downloadButton) {
    downloadButton.disabled = true;
  }
  clearFileSelection();
  clearFieldOrdering();
  if (batchTextarea) {
    batchTextarea.value = "";
  }
  setStatus(locale.selectFile, "info");
}

function resetFieldSection() {
  fieldsForm.classList.add("d-none");
  fieldsForm.innerHTML = "";
  state.fieldValidationRegistry.clear();
  state.retainedFieldValues.clear();
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
  return normalizeFieldsResponse(data);
}

function renderFields(fields, templateRecord) {
  const fieldsForDisplay = normalizeFieldsForDisplay(fields);
  const orderedFields = applyStableFieldOrdering(fieldsForDisplay);

  fieldsForm.innerHTML = "";
  state.fieldValidationRegistry.clear();
  state.fieldMetadata.clear();
  if (!Array.isArray(orderedFields) || orderedFields.length === 0) {
    clearFieldOrdering();
    resetFieldSection();
    if (batchTextarea) {
      batchTextarea.value = "";
    }
    return;
  }

  fieldsForm.classList.remove("d-none");

  const displayedNames = new Set();
  orderedFields.forEach((field, index) => {
    const metadataKey = buildFieldMetadataKey(field, index);
    state.fieldMetadata.set(metadataKey, {
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

  for (const name of Array.from(state.retainedFieldValues.keys())) {
    if (!displayedNames.has(name)) {
      state.retainedFieldValues.delete(name);
    }
  }
  populateBatchTemplate(orderedFields, templateRecord);
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
    note.textContent = `${locale.unsupportedField}: ${field.type}`;
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
  pageHint.textContent = `${locale.pageLabel ?? "Page"} ${field.pageIndex + 1}`;
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
  const keyLabel = locale.keyLabel ?? "Key";
    keyHint.append(`${keyLabel}: `, code);
    wrapper.appendChild(keyHint);
  }

  const actions = createFieldActions(field, metadataKey);
  if (actions) {
    wrapper.appendChild(actions);
  }
}

function createFieldActions(field, metadataKey) {
  if (!metadataKey || !field?.name) {
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
  editButton.title = locale.editField ?? "Edit field";
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
  deleteButton.title = locale.deleteField ?? "Delete field";
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
  return state.fieldMetadata.get(fieldKey) ?? null;
}

function handleEditField(fieldKey) {
  if (!editModal || !editForm) {
    setStatus(locale.editUnavailable ?? locale.requestError, "warning");
    return;
  }

  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata) {
    setStatus(locale.editMissing ?? locale.requestError, "warning");
    return;
  }

  if (!MODIFIABLE_FIELD_TYPES.has(metadata.type)) {
    setStatus(locale.editUnsupported ?? locale.requestError, "warning");
    return;
  }

  populateEditForm(metadata);
  try {
    editModal.show();
  } catch (error) {
    console.error("Failed to show edit modal", error);
    setStatus(locale.requestError, "danger");
  }
}

async function handleFileSelection(event) {
  const files = Array.from(event.target.files ?? []);
  updateFileChooserSummary(files);

  const primaryFile = files[0] ?? null;
  if (!primaryFile) {
    resetState();
    return;
  }

  await loadSingleFormFile(primaryFile);
}

async function handleDownloadClick() {
  if (!hasSelectedFormFile()) {
    setStatus(locale.selectFile, "warning");
    return;
  }
  await performDownload();
}

async function handleDeleteField(fieldKey) {
  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata?.name) {
    setStatus(locale.deleteMissing ?? locale.requestError, "warning");
    return;
  }

  if (!state.currentFile) {
    setStatus(locale.selectFile, "warning");
    return;
  }

  const displayLabel = metadata.label || metadata.name;
  const confirmTemplate =
    locale.deleteConfirm ?? 'Delete "{0}"? This action cannot be undone.';
  const confirmationMessage = confirmTemplate.replace("{0}", displayLabel);
  const confirmed = window.confirm(confirmationMessage);
  if (!confirmed) {
    return;
  }

  const success = await mutatePdf(
    "/api/v1/form/delete-fields",
    "names",
    JSON.stringify([metadata.name]),
    locale.deleteSuccess ?? locale.ready,
    locale.deleting ?? locale.loading
  );

  if (success && metadata.name) {
    state.pendingRemovalNames.add(metadata.name);
    removeRetainedValue(metadata.name);
  }
}

function populateEditForm(metadata) {
  if (!editInputs || !metadata) {
    return;
  }

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
        locale.checkboxDefaultHint ?? "true or false";
    } else if (normalized === "listbox") {
      editInputs.defaultValue.placeholder =
        locale.listboxDefaultHint ?? "Option 1, Option 2";
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
  return trimmed || fallback || "";
}

function sanitizeOptionalText(value) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function parseOptionsInput(raw) {
  return raw ? raw.split(/\r?\n|,/).map(value => value.trim()).filter(value => value.length > 0) : [];
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
  if (!state.currentFile) {
    setStatus(locale.selectFile, "warning");
    return false;
  }

  const formData = new FormData();
  formData.append("file", state.currentFile);
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
    await refreshFormPreviewFromBlob(blob, state.currentFile?.name, successMessage);
    success = true;
  } catch (error) {
    console.error(error);
    const message = error?.message || locale.requestError;
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

  const fieldKey = editForm.dataset.fieldKey;
  const metadata = lookupFieldMetadata(fieldKey);
  if (!metadata) {
  setStatus(locale.editMissing ?? locale.requestError, "warning");
    return;
  }

  const payload = collectModificationPayload(metadata);
  if (!payload) {
  setStatus(locale.editMissing ?? locale.requestError, "warning");
    return;
  }

  const success = await mutatePdf(
    "/api/v1/form/modify-fields",
    "updates",
    JSON.stringify([payload]),
  locale.modifySuccess ?? locale.ready,
  locale.updating ?? locale.loading
  );

  if (success) {
    const targetName = payload.targetName;
    const replacementName = payload.name ?? targetName;
    if (targetName && replacementName && targetName !== replacementName) {
  state.pendingRemovalNames.add(targetName);
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

  state.fieldValidationRegistry.set(input, entry);

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
  state.retainedFieldValues.set(fieldName, snapshot);
    } else {
  state.retainedFieldValues.delete(fieldName);
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

  const retained = state.retainedFieldValues.get(field.name);
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
  state.retainedFieldValues.delete(field.name);
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
  state.retainedFieldValues.delete(field.name);
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
  state.retainedFieldValues.delete(fieldName);
}

function renameRetainedValue(oldName, newName) {
  if (!oldName || !newName || oldName === newName) {
    return;
  }
  if (!state.retainedFieldValues.has(oldName)) {
    return;
  }
  const retained = state.retainedFieldValues.get(oldName);
  state.retainedFieldValues.delete(oldName);
  state.retainedFieldValues.set(newName, retained);
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
  const entry = state.fieldValidationRegistry.get(input);
  if (!entry) {
    return true;
  }
  if (!document.body.contains(input)) {
  state.fieldValidationRegistry.delete(input);
    return true;
  }

  const { constraints, messageEl } = entry;
  const { force = false } = options;
  const { value, isEmpty } = extractValueForValidation(input, constraints);

  let error = "";
  if (constraints.required && isEmpty) {
    if (constraints.multiple) {
      error = locale.validationSelect ?? locale.validationRequired;
    } else {
      error = locale.validationRequired;
    }
  }

  if (!error && constraints.dateLike && !isEmpty) {
    const normalized = toISODate(String(value));
    if (!normalized) {
      error = locale.validationDate ?? locale.validationInvalid;
    }
  }

  if (!error && constraints.emailLike && !isEmpty) {
    if (!EMAIL_REGEX.test(String(value).trim())) {
      error = locale.validationEmail ?? locale.validationInvalid;
    }
  }

  entry.invalid = Boolean(error);
  const shouldShow = entry.touched || force;

  if (entry.invalid && shouldShow) {
    input.classList.add("is-invalid");
    input.setAttribute("aria-invalid", "true");
  messageEl.textContent = error || locale.validationInvalid;
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
  if (state.fieldValidationRegistry.size === 0) return true;

  const { focus = true } = options;
  let firstInvalid = null;

  for (const input of state.fieldValidationRegistry.keys()) {
    if (!validateField(input, { force: true }) && !firstInvalid) {
      firstInvalid = input;
    }
  }

  if (firstInvalid && focus) firstInvalid.focus({ preventScroll: false });
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

function populateBatchTemplate(fields, templateRecord) {
  if (!batchTextarea) return;

  const resolvedTemplate = resolveTemplateRecord(templateRecord, fields);
  if (!isPlainObject(resolvedTemplate) || Object.keys(resolvedTemplate).length === 0) {
    batchTextarea.value = "";
    return;
  }

  batchTextarea.value = JSON.stringify(resolvedTemplate, null, 2);
}

function createTemplateRecordFromFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return {};

  const fillable = fields.filter(field => field?.name && FILLABLE_TYPES.has(field.type));
  if (fillable.length === 0) return {};

  const templateRecord = {};
  fillable.forEach(field => {
    templateRecord[field.name] = inferTemplateValue(field);
  });
  return templateRecord;
}

function buildFieldMetadataKey(field, index) {
  const baseName = (field?.name && String(field.name).trim()) || `field_${index}`;
  return `${baseName}__${index}`;
}

function normalizeFieldsForDisplay(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return [];

  const filtered = [];
  const indexByName = new Map();
  const namesEncountered = new Set();

  fields.forEach(field => {
    const name = typeof field?.name === "string" ? field.name : null;
    if (name) {
      namesEncountered.add(name);
  if (state.pendingRemovalNames.has(name)) return;
    }

    if (name && indexByName.has(name)) {
      filtered[indexByName.get(name)] = field;
    } else {
      if (name) indexByName.set(name, filtered.length);
      filtered.push(field);
    }
  });

  state.pendingRemovalNames.forEach(name => {
    if (!namesEncountered.has(name)) state.pendingRemovalNames.delete(name);
  });

  return filtered;
}

function applyStableFieldOrdering(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
  state.fieldOrdinalOrder.clear();
  state.nextFieldOrdinalValue = 0;
    return [];
  }

  const entries = fields.map((field, index) => {
    const key = resolveFieldOrderKey(field, index);
    if (!state.fieldOrdinalOrder.has(key)) {
      state.fieldOrdinalOrder.set(key, state.nextFieldOrdinalValue++);
    }
    return {
      field,
      key,
  order: state.fieldOrdinalOrder.get(key),
    };
  });

  const currentKeys = new Set(entries.map((entry) => entry.key));
  for (const existingKey of Array.from(state.fieldOrdinalOrder.keys())) {
    if (!currentKeys.has(existingKey)) {
      state.fieldOrdinalOrder.delete(existingKey);
    }
  }
  if (state.fieldOrdinalOrder.size === 0) {
    state.nextFieldOrdinalValue = 0;
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
  state.fieldOrdinalOrder.clear();
  state.nextFieldOrdinalValue = 0;
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

async function performDownload() {
  if (!validateAllFields({ focus: true })) {
    setStatus(locale.validationFix ?? locale.validationRequired, "warning");
    return;
  }
  try {
    toggleInputs(false);
    const formData = new FormData();
    const selectedFiles = getSelectedFormFiles();
    if (selectedFiles.length === 0) {
      setStatus(locale.selectFile, "warning");
      return;
    }

    formData.append("file", selectedFiles[0]);
    formData.append("flatten", String(flattenToggle?.checked ?? false));
    const valueMap = collectFieldValues();
    formData.append("data", JSON.stringify(valueMap));
    setStatus(locale.loading, "info");
    const response = await fetch("/api/v1/form/fill", {
      method: "POST",
      body: formData,
    });
    await handleDownloadResponse(response, "form-filled.pdf");

    setStatus(locale.ready, "success");
  } catch (error) {
    console.error(error);
    setStatus(locale.requestError, "danger");
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
      result[fieldName] = input.value || input.dataset.originalValue || "";
    }
  });
  return result;
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
  if (flattenToggle) flattenToggle.disabled = !enabled;

  if (downloadButton && enabled) {
    updateDownloadButtonVisibility();
  } else if (downloadButton) {
    downloadButton.disabled = true;
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

function updateDownloadButtonVisibility() {
  if (!downloadButton) return;

  downloadButton.disabled = getSelectedFormFiles().length === 0;
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

function initialize() {
  if (editInputs.type) {
    editInputs.type.addEventListener("change", (event) => {
      updateEditTypeControls(event.target?.value ?? "text");
    });
    updateEditTypeControls(editInputs.type.value ?? "text");
  }

  if (editForm) {
    editForm.addEventListener("submit", submitEditForm);
  }

  if (editModalEl) {
    editModalEl.addEventListener("hidden.bs.modal", resetEditForm);
  }

  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelection);
  }

  if (downloadButton) {
    downloadButton.addEventListener("click", handleDownloadClick);
  }

  if (statusEl && !statusEl.textContent) {
    setStatus(locale.selectFile, "info");
  }

  if (batchTextarea) {
    if (!batchTextarea.placeholder) {
      batchTextarea.placeholder = DEFAULT_JSON_PLACEHOLDER;
    }
    batchTextarea.readOnly = true;
  }

  if (downloadButton) {
    updateDownloadButtonVisibility();
  }
}

initialize();
