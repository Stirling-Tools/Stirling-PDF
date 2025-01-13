document.getElementById("validateButton").addEventListener("click", function (event) {
  event.preventDefault();
  validatePipeline();
});
function validatePipeline() {
  let pipelineListItems = document.getElementById("pipelineList").children;
  let isValid = true;
  let containsAddPassword = false;
  for (let i = 0; i < pipelineListItems.length - 1; i++) {
    let currentOperation = pipelineListItems[i].querySelector(".operationName").textContent;
    let nextOperation = pipelineListItems[i + 1].querySelector(".operationName").textContent;
    if (currentOperation === "/add-password") {
      containsAddPassword = true;
    }

    let currentOperationDescription = apiDocs[currentOperation]?.post?.description || "";
    let nextOperationDescription = apiDocs[nextOperation]?.post?.description || "";

    // Strip off 'ZIP-' prefix
    currentOperationDescription = currentOperationDescription.replace("ZIP-", "");
    nextOperationDescription = nextOperationDescription.replace("ZIP-", "");

    let currentOperationOutput = currentOperationDescription.match(/Output:([A-Z\/]*)/)?.[1] || "";
    let nextOperationInput = nextOperationDescription.match(/Input:([A-Z\/]*)/)?.[1] || "";

    // Splitting in case of multiple possible output/input
    let currentOperationOutputArr = currentOperationOutput.split("/");
    let nextOperationInputArr = nextOperationInput.split("/");

    if (currentOperationOutput !== "ANY" && nextOperationInput !== "ANY") {
      let intersection = currentOperationOutputArr.filter((value) => nextOperationInputArr.includes(value));
      console.log(`Intersection: ${intersection}`);

      if (intersection.length === 0) {
        updateValidateButton(false);
        isValid = false;
        console.log(
          `Incompatible operations: The output of operation '${currentOperation}' (${currentOperationOutput}) is not compatible with the input of the following operation '${nextOperation}' (${nextOperationInput}).`,
        );
        alert(
          `Incompatible operations: The output of operation '${currentOperation}' (${currentOperationOutput}) is not compatible with the input of the following operation '${nextOperation}' (${nextOperationInput}).`,
        );
        break;
      }
    }
  }
  if (
    containsAddPassword &&
    pipelineListItems[pipelineListItems.length - 1].querySelector(".operationName").textContent !== "/add-password"
  ) {
    updateValidateButton(false);
    alert('The "add-password" operation should be at the end of the operations sequence. Please adjust the operations order.');
    return false;
  }
  if (isValid) {
    console.log("Pipeline is valid");
    // Continue with the pipeline operation
  } else {
    console.error("Pipeline is not valid");
    // Stop operation, maybe display an error to the user
  }
  updateValidateButton(isValid);
  return isValid;
}

function updateValidateButton(isValid) {
  var validateButton = document.getElementById("validateButton");
  if (isValid) {
    validateButton.classList.remove("btn-danger");
    validateButton.classList.add("btn-success");
  } else {
    validateButton.classList.remove("btn-success");
    validateButton.classList.add("btn-danger");
  }
}

document.getElementById("submitConfigBtn").addEventListener("click", function () {
  if (validatePipeline() === false) {
    return;
  }
  let selectedOperation = document.getElementById("operationsDropdown").value;

  var pipelineName = document.getElementById("pipelineName").value;


  let pipelineList = document.getElementById("pipelineList").children;
  let pipelineConfig = {
    name: pipelineName,
    pipeline: [],
    _examples: {
      outputDir: "{outputFolder}/{folderName}",
      outputFileName: "{filename}-{pipelineName}-{date}-{time}",
    },
    outputDir: "httpWebRequest",
    outputFileName: "{filename}",
  };

  for (let i = 0; i < pipelineList.length; i++) {
    let operationName = pipelineList[i].querySelector(".operationName").textContent;
    let parameters = operationSettings[operationName] || {};
    pipelineConfig.pipeline.push({
      operation: operationName,
      parameters: parameters,
    });
  }

  let pipelineConfigJson = JSON.stringify(pipelineConfig, null, 2);
  let formData = new FormData();

  let fileInput = document.getElementById("fileInput-input");
  let files = fileInput.files;

  for (let i = 0; i < files.length; i++) {
    console.log("files[i]", files[i].name);
    formData.append("fileInput", files[i], files[i].name);
  }

  console.log("pipelineConfigJson", pipelineConfigJson);
  formData.append("json", pipelineConfigJson);
  console.log("formData", formData);

  fetchWithCsrf("api/v1/pipeline/handleData", {
    method: "POST",
    body: formData,
  })
    .then((response) => {
      // Save the response to use it later
      const responseToUseLater = response;

      return response.blob().then((blob) => {
        let url = window.URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;

        // Use responseToUseLater instead of response
        const contentDisposition = responseToUseLater.headers.get("Content-Disposition");
        let filename = "download";
        if (contentDisposition && contentDisposition.indexOf("attachment") !== -1) {
          filename = decodeURIComponent(contentDisposition.split("filename=")[1].replace(/"/g, "")).trim();
        }
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    })
    .catch((error) => {
      console.error("Error:", error);
    });
});

let apiDocs = {};
let apiSchemas = {};
let operationSettings = {};

fetchWithCsrf("v1/api-docs")
  .then((response) => response.json())
  .then((data) => {
    apiDocs = data.paths;
    apiSchemas = data.components.schemas;
    let operationsDropdown = document.getElementById("operationsDropdown");
    const ignoreOperations = ["/api/v1/pipeline/handleData", "/api/v1/pipeline/operationToIgnore"]; // Add the operations you want to ignore here

    operationsDropdown.innerHTML = "";

    let operationsByTag = {};

    // Group operations by tags
    Object.keys(data.paths).forEach((operationPath) => {
      let operation = data.paths[operationPath].post;
      if (!operation || !operation.description) {
        console.log(operationPath);
      }
      //!operation.description.includes("Type:MISO")
      if (operation && !ignoreOperations.includes(operationPath)) {
        let operationTag = operation.tags[0]; // This assumes each operation has exactly one tag
        if (!operationsByTag[operationTag]) {
          operationsByTag[operationTag] = [];
        }
        operationsByTag[operationTag].push(operationPath);
      }
    });

    // Sort operations within each tag alphabetically
    Object.keys(operationsByTag).forEach((tag) => {
      operationsByTag[tag].sort();
    });

    // Specify the order of tags
    let tagOrder = ["General", "Security", "Convert", "Misc", "Filter"];

    // Create dropdown options
    tagOrder.forEach((tag) => {
      if (operationsByTag[tag]) {
        let group = document.createElement("optgroup");
        group.label = tag;

        operationsByTag[tag].forEach((operationPath) => {
          let option = document.createElement("option");

          let operationPathDisplay = operationPath;
          operationPathDisplay = operationPath.replace(new RegExp("api/v1/" + tag.toLowerCase() + "/", "i"), "");

          if (operationPath.includes("/convert")) {
            operationPathDisplay = operationPathDisplay.replace(/^\//, "").replaceAll("/", " to ");
          } else {
            operationPathDisplay = operationPathDisplay.replace(/\//g, ""); // Remove slashes
          }
          operationPathDisplay = operationPathDisplay.replaceAll(" ", "-");
          option.textContent = operationPathDisplay;
          option.value = operationPath; // Keep the value with slashes for querying
          group.appendChild(option);
        });

        operationsDropdown.appendChild(group);
      }
    });
  });

document.getElementById('deletePipelineBtn').addEventListener('click', function(event) {
    event.preventDefault();
    let pipelineName = document.getElementById('pipelineName').value;

  if (confirm(deletePipelineText + pipelineName)) {
    removePipelineFromUI(pipelineName);
      let key = "#Pipeline-" + pipelineName;
      if (localStorage.getItem(key)) {
              localStorage.removeItem(key);
      }
      let pipelineSelect = document.getElementById("pipelineSelect");
      let modal = document.getElementById('pipelineSettingsModal');
      if (modal.style.display !== 'none') {
          $('#pipelineSettingsModal').modal('hide');
      }

      if (pipelineSelect.options.length > 0) {
          pipelineSelect.selectedIndex = 0;
          pipelineSelect.dispatchEvent(new Event('change'));
      }
    }
});

function removePipelineFromUI(pipelineName) {
    let pipelineSelect = document.getElementById("pipelineSelect");
    for (let i = 0; i < pipelineSelect.options.length; i++) {
    console.log(pipelineSelect.options[i])
    console.log("list " + pipelineSelect.options[i].innerText + " vs " + pipelineName)
        if (pipelineSelect.options[i].innerText === pipelineName) {
            pipelineSelect.remove(i);
            break;
        }
    }
}


document.getElementById("addOperationBtn").addEventListener("click", function () {
  let selectedOperation = document.getElementById("operationsDropdown").value;
  let pipelineList = document.getElementById("pipelineList");

  let listItem = document.createElement("li");
  listItem.className = "list-group-item";
  let hasSettings = false;
  if (apiDocs[selectedOperation] && apiDocs[selectedOperation].post) {
    const postMethod = apiDocs[selectedOperation].post;

    // Check if parameters exist
    if (postMethod.parameters && postMethod.parameters.length > 0) {
      hasSettings = true;
    } else if (postMethod.requestBody && postMethod.requestBody.content["multipart/form-data"]) {
      // Extract the reference key
      const refKey = postMethod.requestBody.content["multipart/form-data"].schema["$ref"].split("/").pop();
      // Check if the referenced schema exists and has properties more than just its input file
      if (apiSchemas[refKey]) {
        const properties = apiSchemas[refKey].properties;
        const propertyKeys = Object.keys(properties);

        // Check if there's more than one property or if there's exactly one property and its format is not 'binary'
        if (propertyKeys.length > 1 || (propertyKeys.length === 1 && properties[propertyKeys[0]].format !== "binary")) {
          hasSettings = true;
        }
      }
    }
  }

  listItem.innerHTML = `
      <div class="d-flex justify-content-between align-items-center w-100">
          <div class="operationName">${selectedOperation}</div>
          <div class="arrows d-flex">
              <button class="btn btn-secondary move-up ms-1"><span class="material-symbols-rounded">arrow_upward</span></button>
              <button class="btn btn-secondary move-down ms-1"><span class="material-symbols-rounded">arrow_downward</span></button>
              <button class="btn ${hasSettings ? "btn-warning" : "btn-secondary"} pipelineSettings ms-1" ${
                hasSettings ? "" : "disabled"
              }>
              <span class="material-symbols-rounded">settings</span>
          </button>
              <button class="btn btn-danger remove ms-1"><span class="material-symbols-rounded">close</span></button>
          </div>
      </div>
  `;

  pipelineList.appendChild(listItem);

  listItem.querySelector(".move-up").addEventListener("click", function (event) {
    event.preventDefault();
    if (listItem.previousElementSibling) {
      pipelineList.insertBefore(listItem, listItem.previousElementSibling);
      updateConfigInDropdown();
    }
  });

  listItem.querySelector(".move-down").addEventListener("click", function (event) {
    event.preventDefault();
    if (listItem.nextElementSibling) {
      pipelineList.insertBefore(listItem.nextElementSibling, listItem);
      updateConfigInDropdown();
    }
  });

  listItem.querySelector(".remove").addEventListener("click", function (event) {
    event.preventDefault();
    pipelineList.removeChild(listItem);
    hideOrShowPipelineHeader();
    updateConfigInDropdown();
  });

  listItem.querySelector(".pipelineSettings").addEventListener("click", function (event) {
    event.preventDefault();
    showpipelineSettingsModal(selectedOperation);
    hideOrShowPipelineHeader();
  });

  function showpipelineSettingsModal(operation) {
    let pipelineSettingsModal = document.getElementById("pipelineSettingsModal");
    let pipelineSettingsContent = document.getElementById("pipelineSettingsContent");
    let operationData = apiDocs[operation].post.parameters || [];

    // Resolve the $ref reference to get actual schema properties
    let refKey = apiDocs[operation].post.requestBody.content["multipart/form-data"].schema["$ref"].split("/").pop();
    let requestBodyData = apiSchemas[refKey].properties || {};

    // Combine operationData and requestBodyData into a single array
    operationData = operationData.concat(
      Object.keys(requestBodyData).map((key) => ({
        name: key,
        schema: requestBodyData[key],
      })),
    );

    pipelineSettingsContent.innerHTML = "";

    operationData.forEach((parameter) => {
      // If the parameter name is 'fileInput', return early to skip the rest of this iteration
      if (parameter.name === "fileInput") return;

      let parameterDiv = document.createElement("div");
      parameterDiv.className = "mb-3";

      let parameterLabel = document.createElement("label");
      parameterLabel.textContent = `${parameter.name} (${parameter.schema.type}): `;
      parameterLabel.title = parameter.schema.description;
      parameterLabel.setAttribute("for", parameter.name);
      parameterDiv.appendChild(parameterLabel);

      let defaultValue = parameter.schema.example;
      if (defaultValue === undefined) defaultValue = parameter.schema.default;

      let parameterInput;

      // check if enum exists in schema
      if (parameter.schema.enum) {
        // if enum exists, create a select element
        parameterInput = document.createElement("select");
        parameterInput.className = "form-control";

        // iterate over each enum value and create an option for it
        parameter.schema.enum.forEach((value) => {
          let option = document.createElement("option");
          option.value = value;
          option.text = value;
          parameterInput.appendChild(option);
        });
      } else {
        // switch-case statement for handling non-enum types
        switch (parameter.schema.type) {
          case "string":
            if (parameter.schema.format === "binary") {
              // This is a file input

              //parameterInput = document.createElement('input');
              //parameterInput.type = 'file';
              //parameterInput.className = "form-control";

              parameterInput = document.createElement("input");
              parameterInput.type = "text";
              parameterInput.className = "form-control";
              parameterInput.value = "FileInputPathToBeInputtedManuallyForOffline";
            } else {
              parameterInput = document.createElement("input");
              parameterInput.type = "text";
              parameterInput.className = "form-control";
              if (defaultValue !== undefined) parameterInput.value = defaultValue;
            }
            break;
          case "number":
          case "integer":
            parameterInput = document.createElement("input");
            parameterInput.type = "number";
            parameterInput.className = "form-control";
            if (defaultValue !== undefined) parameterInput.value = defaultValue;
            break;
          case "boolean":
            parameterInput = document.createElement("input");
            parameterInput.type = "checkbox";
            if (defaultValue === true) parameterInput.checked = true;
            break;
           case "array":
         // If parameter.schema.format === 'binary' is to be checked, it should be checked here
         parameterInput = document.createElement("textarea");
         parameterInput.placeholder = 'Enter a JSON formatted array, e.g., ["item1", "item2", "item3"]';
         parameterInput.className = "form-control";
         break;
       case "object":
         parameterInput = document.createElement("textarea");
         parameterInput.placeholder = 'Enter a JSON formatted object, e.g., {"key": "value"}  If this is a fileInput, it is not currently supported';
         parameterInput.className = "form-control";
         break;
       default:
             parameterInput = document.createElement("input");
             parameterInput.type = "text";
             parameterInput.className = "form-control";
             if (defaultValue !== undefined) parameterInput.value = defaultValue;
        }
      }
      parameterInput.id = parameter.name;

      console.log("defaultValue", defaultValue);
      console.log("parameterInput", parameterInput);
      if (operationSettings[operation] && operationSettings[operation][parameter.name] !== undefined) {
        let savedValue = operationSettings[operation][parameter.name];

        switch (parameter.schema.type) {
          case "number":
          case "integer":
            parameterInput.value = savedValue.toString();
            break;
          case "boolean":
            parameterInput.checked = savedValue;
            break;
          case "array":
          case "object":
            parameterInput.value = JSON.stringify(savedValue);
            break;
          default:
            parameterInput.value = savedValue;
        }
      }
      console.log("parameterInput2", parameterInput);
      parameterDiv.appendChild(parameterInput);

      pipelineSettingsContent.appendChild(parameterDiv);
    });

    if (hasSettings) {
      let saveButton = document.createElement("button");
      saveButton.textContent = saveSettings;
      saveButton.className = "btn btn-primary";
      saveButton.addEventListener("click", function (event) {
        event.preventDefault();
        let settings = {};
        operationData.forEach((parameter) => {
          if (parameter.name !== "fileInput") {
            let value = document.getElementById(parameter.name).value;
            switch (parameter.schema.type) {
              case "number":
              case "integer":
                settings[parameter.name] = Number(value);
                break;
              case "boolean":
                settings[parameter.name] = document.getElementById(parameter.name).checked;
                break;
              case "array":
              case "object":
                 if (value === null || value === "") {
            settings[parameter.name] = "";
          } else {
            try {
              const parsedValue = JSON.parse(value);
              if (Array.isArray(parsedValue)) {
                settings[parameter.name] = parsedValue;
              } else {
                settings[parameter.name] = value;
              }
            } catch (e) {
              settings[parameter.name] = value;
            }
         }
         break;
              default:
                settings[parameter.name] = value;
            }
          }
        });
        operationSettings[operation] = settings;
        //pipelineSettingsModal.style.display = "none";
      });
      pipelineSettingsContent.appendChild(saveButton);
      saveButton.click();
    }
    //pipelineSettingsModal.style.display = "block";

    //pipelineSettingsModal.getElementsByClassName("close")[0].onclick = function() {
    //  pipelineSettingsModal.style.display = "none";
    //}

    //window.onclick = function(event) {
    //  if (event.target == pipelineSettingsModal) {
    //    pipelineSettingsModal.style.display = "none";
    //  }
    //}
  }
  showpipelineSettingsModal(selectedOperation);
  updateConfigInDropdown();
  hideOrShowPipelineHeader();
});

function loadBrowserPipelinesIntoDropdown() {
  let pipelineSelect = document.getElementById("pipelineSelect");

  // Retrieve the current set of option values for comparison
  let existingOptions = new Set();
  for (let option of pipelineSelect.options) {
    existingOptions.add(option.value);
  }

   // Iterate over all items in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    let key = localStorage.key(i);
    if (key.startsWith("#Pipeline-")) {
      let pipelineData = localStorage.getItem(key);
      // Check if the data is already in the dropdown
      if (!existingOptions.has(pipelineData)) {
        let pipelineName = key.replace("#Pipeline-", ""); // Extract pipeline name from the key
        let option = new Option(pipelineName, pipelineData); // Use pipeline data as the option value
        pipelineSelect.appendChild(option);
      }
    }
  }
}
loadBrowserPipelinesIntoDropdown();

function updateConfigInDropdown() {
  let pipelineSelect = document.getElementById("pipelineSelect");
  let selectedOption = pipelineSelect.options[pipelineSelect.selectedIndex];

  // Get the current configuration as JSON
  let pipelineConfigJson = configToJson();
  console.log("pipelineConfigJson", pipelineConfigJson);
  if (!pipelineConfigJson) {
    console.error("Failed to update configuration: Invalid configuration");
    return;
  }

  // Update the value of the selected option with the new configuration
  selectedOption.value = pipelineConfigJson;
}

var saveBtn = document.getElementById("savePipelineBtn");
var saveBrowserBtn = document.getElementById("saveBrowserPipelineBtn");
// Remove any existing event listeners
saveBtn.removeEventListener("click", savePipeline);
saveBrowserBtn.removeEventListener("click", savePipelineToBrowser);
// Add the event listener
saveBtn.addEventListener("click", savePipeline);
saveBrowserBtn.addEventListener("click", savePipelineToBrowser);

function configToJson() {
  if (!validatePipeline()) {
    return null; // Return null if validation fails
  }

  var pipelineName = document.getElementById("pipelineName").value;
  let pipelineList = document.getElementById("pipelineList").children;
  let pipelineConfig = {
    name: pipelineName,
    pipeline: [],
    _examples: {
      outputDir: "{outputFolder}/{folderName}",
      outputFileName: "{filename}-{pipelineName}-{date}-{time}",
    },
    outputDir: "{outputFolder}",
    outputFileName: "{filename}",
  };

  for (let i = 0; i < pipelineList.length; i++) {
    let operationName = pipelineList[i].querySelector(".operationName").textContent;
    let parameters = operationSettings[operationName] || {};

    parameters["fileInput"] = "automated";

    pipelineConfig.pipeline.push({
      operation: operationName,
      parameters: parameters,
    });
  }
  return JSON.stringify(pipelineConfig, null, 2);
}

function savePipelineToBrowser() {
  let pipelineConfigJson = configToJson();
  if (!pipelineConfigJson) {
    console.error("Failed to save pipeline: Invalid configuration");
    return;
  }

  let pipelineName = document.getElementById("pipelineName").value;
  if (!pipelineName) {
    console.error("Failed to save pipeline: Pipeline name is required");
    return;
  }
  localStorage.setItem("#Pipeline-" +pipelineName, pipelineConfigJson);
  console.log("Pipeline configuration saved to localStorage");
}
function savePipeline() {
  let pipelineConfigJson = configToJson();
  if (!pipelineConfigJson) {
    console.error("Failed to save pipeline: Invalid configuration");
    return;
  }

  let pipelineName = document.getElementById("pipelineName").value;
  console.log("Downloading...");
  let a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([pipelineConfigJson], { type: "application/json" }));
  a.download = pipelineName + ".json";
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function processPipelineConfig(configString) {
  console.log("configString", configString);
  let pipelineConfig = JSON.parse(configString);
  let pipelineList = document.getElementById("pipelineList");

  while (pipelineList.firstChild) {
    pipelineList.removeChild(pipelineList.firstChild);
  }
  document.getElementById("pipelineName").value = pipelineConfig.name;
  for (const operationConfig of pipelineConfig.pipeline) {
    let operationsDropdown = document.getElementById("operationsDropdown");
    operationsDropdown.value = operationConfig.operation;
    operationSettings[operationConfig.operation] = operationConfig.parameters;

    // assuming addOperation is async
    await new Promise((resolve) => {
      document.getElementById("addOperationBtn").addEventListener("click", resolve, { once: true });
      document.getElementById("addOperationBtn").click();
    });

    let lastOperation = pipelineList.lastChild;

    Object.keys(operationConfig.parameters).forEach((parameterName) => {
      let input = document.getElementById(parameterName);
      if (input) {
        switch (input.type) {
          case "checkbox":
            input.checked = operationConfig.parameters[parameterName];
            break;
          case "number":
            input.value = operationConfig.parameters[parameterName].toString();
            break;
          case "file":
            if (parameterName !== "fileInput") {
              // Create a new file input element
              let newInput = document.createElement("input");
              newInput.type = "file";
              newInput.id = parameterName;

              // Add the new file input to the main page (change the selector according to your needs)
              document.querySelector("#main").appendChild(newInput);
            }
            break;
          case "text":
          case "textarea":
          default:
      var value = operationConfig.parameters[parameterName]
      if (typeof value !== 'string') {
          input.value = JSON.stringify(value) ;
      } else {
        input.value = value;
      }

        }
      }
    });
  }
}

document.getElementById("uploadPipelineBtn").addEventListener("click", function () {
  document.getElementById("uploadPipelineInput").click();
});

document.getElementById("uploadPipelineInput").addEventListener("change", function (e) {
  let reader = new FileReader();
  reader.onload = function (event) {
    processPipelineConfig(event.target.result);
  };
  reader.readAsText(e.target.files[0]);
  hideOrShowPipelineHeader();
});

document.getElementById("pipelineSelect").addEventListener("change", function (e) {
  let selectedPipelineJson = e.target.value; // assuming the selected value is the JSON string of the pipeline config
  processPipelineConfig(selectedPipelineJson);
});

function hideOrShowPipelineHeader() {
  var pipelineHeader = document.getElementById("pipelineHeader");
  var pipelineList = document.getElementById("pipelineList");

  if (pipelineList.children.length === 0) {
    // Hide the pipeline header if there are no items in the pipeline list
    pipelineHeader.style.display = "none";
  } else {
    // Show the pipeline header if there are items in the pipeline list
    pipelineHeader.style.display = "block";
  }
}
