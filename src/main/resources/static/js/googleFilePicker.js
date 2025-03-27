  const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
  const SESSION_STORAGE_ID = "googleDrivePickerAccessToken"

  let tokenClient;
  let accessToken = sessionStorage.getItem(SESSION_STORAGE_ID);

  document.getElementById("google-drive-button").addEventListener('click', onGoogleDriveButtonClick);

  /**
   * Callback after api.js is loaded.
   */
  function gapiLoaded() {
    gapi.load('client:picker', initializePicker);
  }

  /**
   * Callback after the API client is loaded. Loads the
   * discovery doc to initialize the API.
   */
  async function initializePicker() {
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
  }

  /**
   * Callback after Google Identity Services are loaded.
   */
  function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // defined later
    });
  }

  /**
   *  Sign in the user upon button click.
   */
  function onGoogleDriveButtonClick(e) {
    
    e.stopPropagation();

    tokenClient.callback = (response) => {
      if (response.error !== undefined) {
        throw (response);
      }
      accessToken = response.access_token;
      sessionStorage.setItem(SESSION_STORAGE_ID, accessToken);
      createPicker();
    };

    tokenClient.requestAccessToken({prompt: accessToken === null? 'consent' : ''});
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

  /**
   *  Create and render a Picker object for searching images.
   */
  function createPicker() {
    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setDeveloperKey(API_KEY)
        .setAppId(APP_ID)
        .setOAuthToken(accessToken)
        .addView( 
          new google.picker.DocsView()
            .setIncludeFolders(true)
            .setMimeTypes('application/pdf,image/png,image/jpg,image/jpeg,image/svg')
          )
        .addView( 
          new google.picker.DocsView()
            .setIncludeFolders(true)
            .setMimeTypes('application/pdf,image/*')
            .setEnableDrives(true)
          )
        .setCallback(pickerCallback)
        .setTitle('Stirling PDF - Google Drive')
        .build();
    picker.setVisible(true);
  }

  /**
   * Displays the file details of the user's selection.
   * @param {object} data - Containers the user selection from the picker
   */
  async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
      const files =  await Promise.all(data[google.picker.Response.DOCUMENTS].map(async pickedFile => {
        const fileId = pickedFile[google.picker.Document.ID];
        console.log(fileId);
        const res = await gapi.client.drive.files.get({
          'fileId': fileId,
          'alt': 'media',
        });
      
        var file = new File([new Uint8Array(res.body.length).map((_, i) => res.body.charCodeAt(i))],
          pickedFile.name, {
          type: pickedFile.mimeType,
            lastModified: pickedFile.lastModified,
            endings: pickedFile.endings
          } );
        return file;
      }));

      document.body.dispatchEvent(new CustomEvent("googleDriveFilePicked", {detail: files}));
    }
  }