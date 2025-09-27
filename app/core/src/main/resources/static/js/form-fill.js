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

fileInput?.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files ?? []);
  const primaryFile = files[0] ?? null;

  if (!primaryFile) {
    previousTemplateFileKeys = [];
    resetState();
    return;
  }

  currentFile = primaryFile;
  const multiMode = isMultiTemplateMode();

  if (!multiMode) {
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
      const fields = await fetchFields(primaryFile);
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
      previousTemplateFileKeys = [getFileSignature(primaryFile)];
    } catch (error) {
      console.error(error);
      setStatus(formFillLocale.requestError, "danger");
      resetFieldSection();
    } finally {
      toggleInputs(true);
    }
    return;
  }

  if (batchFileInput) {
    batchFileInput.value = "";
  }

  setStatus(formFillLocale.loading, "info");
  toggleInputs(false);
  resetFieldSection();
  try {
    const records = await buildMultiTemplateRecords(files);
    previousTemplateFileKeys = files.map((file) => getFileSignature(file));
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

batchFileInput?.addEventListener("change", () => {
  batchEdited = false;
  updateBatchButtonState({ silent: true });
  if (batchFileInput.files?.length) {
    setStatus(formFillLocale.batchFileReady ?? formFillLocale.batchReady, "success");
  }
});

multiTemplateToggle?.addEventListener("change", () => {
  const enabled = multiTemplateToggle.checked;
  if (fileInput) {
    fileInput.multiple = enabled;
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
  clearFileSelection();
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
  fieldsForm.innerHTML = "";
  fieldValidationRegistry.clear();
  if (!Array.isArray(fields) || fields.length === 0) {
    resetFieldSection();
    if (!batchEdited && batchTextarea) {
      batchTextarea.value = "";
    }
    return;
  }

  fieldsForm.classList.remove("d-none");

  fields.forEach((field, index) => {
    const group = buildFieldGroup(field, index);
    fieldsForm.appendChild(group);
  });

  populateBatchTemplate(fields);
}

function buildFieldGroup(field, index) {
  const isCheckbox = field.type === "checkbox";
  const wrapper = document.createElement("div");
  wrapper.className = isCheckbox ? "form-check ms-3 mb-3" : "mb-3";

  const inputId = `formField_${index}`;
  const input = buildInputForField(field, inputId);

  if (!input) {
    const note = document.createElement("div");
    note.className = "form-text text-muted";
    note.textContent = `${formFillLocale.unsupportedField}: ${field.type}`;
    wrapper.appendChild(note);
    return wrapper;
  }

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

  appendFieldDetails(wrapper, field);
  setupInlineValidation(input, field, wrapper);
  return wrapper;
}

function appendFieldDetails(wrapper, field) {
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
      element.multiple = true;
      if (Array.isArray(field.options)) {
        element.size = Math.min(6, Math.max(3, field.options.length));
      }
      addOptionsToSelect(element, field.options, currentValue, true);
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
      const batchFile = batchFileInput?.files?.[0] ?? null;
      if (batchFile) {
        formData.append("recordsFile", batchFile);
      } else {
        const payload = parseBatchPayload();
        formData.append("records", JSON.stringify(payload));
      }
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
    const selectedFiles = fileChooser.querySelector(".selected-files");
    if (selectedFiles) {
      selectedFiles.innerHTML = "";
    }
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
  const hasFile = Boolean(batchFileInput?.files?.length);
  if (hasFile) {
    batchButton.disabled = false;
    if (!silent) {
      setStatus(formFillLocale.batchFileReady ?? formFillLocale.batchReady, "success");
    }
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

// Set initial state when script loads
if (statusEl && !statusEl.textContent) {
  setStatus(formFillLocale.selectFile, "info");
}

if (batchTextarea && !batchTextarea.placeholder) {
  batchTextarea.placeholder = DEFAULT_BATCH_PLACEHOLDER;
}
