const SCOPES = "https://www.googleapis.com/auth/drive.readonly";
const SESSION_STORAGE_ID = "googleDrivePickerAccessToken";

let tokenClient;
let accessToken = sessionStorage.getItem(SESSION_STORAGE_ID);

let isScriptExecuted = false;
if (!isScriptExecuted) {
  isScriptExecuted = true;
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".google-drive-button").forEach(setupGoogleDrivePicker);
  });
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: window.stirlingPDF.GoogleDriveClientId,
    scope: SCOPES,
    callback: "", // defined later
  });
}

// add more as needed.
// Google picker is limited on what mimeTypes are supported
// Wild card are not supported
const expandableMimeTypes = {
  "image/*" : ["image/jpeg", "image/png","image/svg+xml" ]
}

function fileInputToGooglePickerMimeTypes(accept) {

  if(accept == null || accept == "" || accept.includes("*/*")){

    // Setting null will accept all supported mimetypes
    return null;
  }

  let mimeTypes = [];
  accept.split(',').forEach(part => {
    if(!(part in expandableMimeTypes)){
      mimeTypes.push(part);
      return;
    }

    expandableMimeTypes[part].forEach(mimeType => {
      mimeTypes.push(mimeType);
    });
  });

  const  mimeString =  mimeTypes.join(",").replace(/\s+/g, '');
  console.log([accept, "became", mimeString]);
  return mimeString;
}

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
  gapi.load("client:picker", initializePicker);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializePicker() {
  await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
}

function setupGoogleDrivePicker(picker) {

  const name = picker.getAttribute('data-name');
  const accept = picker.getAttribute('data-accept');
  const multiple = picker.getAttribute('data-multiple') === "true";
  const mimeTypes = fileInputToGooglePickerMimeTypes(accept);

  picker.addEventListener("click", onGoogleDriveButtonClick);

  function onGoogleDriveButtonClick(e) {
    e.stopPropagation();

    tokenClient.callback = (response) => {
      if (response.error !== undefined) {
        throw response;
      }
      accessToken = response.access_token;
      sessionStorage.setItem(SESSION_STORAGE_ID, accessToken);
      createGooglePicker();
    };

    tokenClient.requestAccessToken({ prompt: accessToken === null ? "consent" : "" });
  }

  /**
   *  Sign out the user upon button click.
   */
  function signOut() {
    if (accessToken) {
      sessionStorage.removeItem(SESSION_STORAGE_ID);
      google.accounts.oauth2.revoke(accessToken);
      accessToken = null;
    }
  }

  function createGooglePicker() {
    let builder = new google.picker.PickerBuilder()
      .setDeveloperKey(window.stirlingPDF.GoogleDriveApiKey)
      .setAppId(window.stirlingPDF.GoogleDriveAppId)
      .setOAuthToken(accessToken)
      .addView(
        new google.picker.DocsView()
          .setIncludeFolders(true)
          .setMimeTypes(mimeTypes)
      )
      .addView(
        new google.picker.DocsView()
          .setIncludeFolders(true)
          .setEnableDrives(true)
          .setMimeTypes(mimeTypes)
      )
      .setCallback(pickerCallback);

    if(multiple) {
      builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
    }
    const picker = builder.build();

    picker.setVisible(true);
  }

  /**
   * Displays the file details of the user's selection.
   * @param {object} data - Containers the user selection from the picker
   */
  async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
      const files = await Promise.all(
        data[google.picker.Response.DOCUMENTS].map(async (pickedFile) => {
          const fileId = pickedFile[google.picker.Document.ID];
          console.log(fileId);
          const res = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: "media",
          });

          let file = new File([new Uint8Array(res.body.length).map((_, i) => res.body.charCodeAt(i))], pickedFile.name, {
            type: pickedFile.mimeType,
            lastModified: pickedFile.lastModified,
            endings: pickedFile.endings,
          });
          return file;
        })
      );

      document.body.dispatchEvent(new CustomEvent(name+"GoogleDriveDrivePicked", { detail: files }));
    }
  }
}
