document.addEventListener("DOMContentLoaded", function() {

  var cacheInputs = localStorage.getItem("cacheInputs") || "disabled";
  if (cacheInputs !== "enabled") {
    return; // Stop execution if caching is not enabled
  }

  // Function to generate a key based on the form's action attribute
  function generateStorageKey(form) {
    const action = form.getAttribute('action');
    if (!action || action.length < 3) {
      return null; // Not a valid action, return null to skip processing
    }
    return 'formData_' + encodeURIComponent(action);
  }

  // Function to save form data to localStorage
  function saveFormData(form) {
    const formKey = generateStorageKey(form);
    if (!formKey) return; // Skip if no valid key

    const formData = {};
    const elements = form.elements;
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      // Skip elements without names, passwords, files, hidden fields, and submit/reset buttons
      if (!element.name ||
          element.type === 'password' ||
          element.type === 'file' ||
          //element.type === 'hidden' ||
          element.type === 'submit' ||
          element.type === 'reset') {
        continue;
      }
      // Handle checkboxes: store only if checked
      if (element.type === 'checkbox') {
        if (element.checked) {
          formData[element.name] = element.value;
        } else {
          continue; // Skip unchecked boxes
        }
      } else {
        // Skip saving empty values
        if (element.value === "" || element.value == null) {
          continue;
        }
        formData[element.name] = element.value;
      }
    }
    if (Object.keys(formData).length > 0) {
      localStorage.setItem(formKey, JSON.stringify(formData));
    }
  }

  // Function to load form data from localStorage
  function loadFormData(form) {
    const formKey = generateStorageKey(form);
    if (!formKey) return; // Skip if no valid key

    const savedData = localStorage.getItem(formKey);
    if (savedData) {
      const formData = JSON.parse(savedData);
      for (const key in formData) {
        if (formData.hasOwnProperty(key) && form.elements[key]) {
          const element = form.elements[key];
          if (element.type === 'checkbox') {
            element.checked = true;
          } else {
            element.value = formData[key];
          }
        }
      }
    }
  }

  // Attach event listeners and load data for all forms
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(event) {
      saveFormData(form);
    });
    loadFormData(form);
  });
});
