<h1 align="center">Konfuzio PDF Tools</h1>

[Stirling-PDF](https://www.stirlingpdf.com) is a robust, locally hosted web-based PDF manipulation tool using Docker. It enables you to carry out various operations on PDF files, including splitting, merging, converting, reorganizing, adding images, rotating, compressing, and more. This locally hosted web application has evolved to encompass a comprehensive set of features, addressing all your PDF requirements.

All files and PDFs exist either exclusively on the client side, reside in server memory only during task execution, or temporarily reside in a file solely for the execution of the task. Any file downloaded by the user will have been deleted from the server by that point.

Homepage: [https://stirlingpdf.com](https://stirlingpdf.com)

All documentation available at [https://docs.stirlingpdf.com/](https://docs.stirlingpdf.com/)

![stirling-home](images/stirling-home.jpg)

## Features

- 50+ PDF Operations
- Parallel file processing and downloads
- Dark mode support
- Custom download options
- Custom 'Pipelines' to run multiple features in a automated queue
- API for integration with external scripts
- Optional Login and Authentication support (see [here](https://docs.stirlingpdf.com/Advanced%20Configuration/System%20and%20Security) for documentation)
- Database Backup and Import (see [here](https://docs.stirlingpdf.com/Advanced%20Configuration/DATABASE) for documentation)
- Enterprise features like SSO see [here](https://docs.stirlingpdf.com/Enterprise%20Edition)

## PDF Features

### Page Operations

- View and modify PDFs - View multi-page PDFs with custom viewing, sorting, and searching. Plus, on-page edit features like annotating, drawing, and adding text and images. (Using PDF.js with Joxit and Liberation fonts)
- Full interactive GUI for merging/splitting/rotating/moving PDFs and their pages
- Merge multiple PDFs into a single resultant file
- Split PDFs into multiple files at specified page numbers or extract all pages as individual files
- Reorganize PDF pages into different orders
- Rotate PDFs in 90-degree increments
- Remove pages
- Multi-page layout (format PDFs into a multi-paged page)
- Scale page contents size by set percentage
- Adjust contrast
- Crop PDF
- Auto-split PDF (with physically scanned page dividers)
- Extract page(s)
- Convert PDF to a single page
- Overlay PDFs on top of each other
- PDF to a single page
- Split PDF by sections

### Conversion Operations

- Convert PDFs to and from images
- Convert any common file to PDF (using LibreOffice)
- Convert PDF to Word/PowerPoint/others (using LibreOffice)
- Convert HTML to PDF
- Convert PDF to XML
- Convert PDF to CSV
- URL to PDF
- Markdown to PDF

### Security & Permissions

- Add and remove passwords
- Change/set PDF permissions
- Add watermark(s)
- Certify/sign PDFs
- Sanitize PDFs
- Auto-redact text

### Other Operations

- Add/generate/write signatures
- Split by Size or PDF
- Repair PDFs
- Detect and remove blank pages
- Compare two PDFs and show differences in text
- Add images to PDFs
- Compress PDFs to decrease their filesize (using qpdf)
- Extract images from PDF
- Remove images from PDF
- Extract images from scans
- Remove annotations
- Add page numbers
- Auto-rename files by detecting PDF header text
- OCR on PDF (using Tesseract OCR)
- PDF/A conversion (using LibreOffice)
- Edit metadata
- Flatten PDFs
- Get all information on a PDF to view or export as JSON
- Show/detect embedded JavaScript




# 📖 Get Started

Visit our comprehensive documentation at [docs.stirlingpdf.com](https://docs.stirlingpdf.com) for:

- Installation guides for all platforms
- Configuration options
- Feature documentation
- API reference
- Security setup
- Enterprise features


## Supported Languages

Stirling-PDF currently supports 39 languages!

| Language                                     | Progress                               |
| -------------------------------------------- | -------------------------------------- |
| Arabic (العربية) (ar_AR)                        | ![90%](https://geps.dev/progress/90)   |
| Azerbaijani (Azərbaycan Dili) (az_AZ)        | ![89%](https://geps.dev/progress/89)   |
| Basque (Euskara) (eu_ES)                     | ![51%](https://geps.dev/progress/51)   |
| Bulgarian (Български) (bg_BG)                | ![86%](https://geps.dev/progress/86)   |
| Catalan (Català) (ca_CA)                     | ![81%](https://geps.dev/progress/81)   |
| Croatian (Hrvatski) (hr_HR)                  | ![87%](https://geps.dev/progress/87)   |
| Czech (Česky) (cs_CZ)                        | ![87%](https://geps.dev/progress/87)   |
| Danish (Dansk) (da_DK)                       | ![86%](https://geps.dev/progress/86)   |
| Dutch (Nederlands) (nl_NL)                   | ![85%](https://geps.dev/progress/85)   |
| English (English) (en_GB)                    | ![100%](https://geps.dev/progress/100) |
| English (US) (en_US)                         | ![100%](https://geps.dev/progress/100) |
| French (Français) (fr_FR)                    | ![92%](https://geps.dev/progress/92)   |
| German (Deutsch) (de_DE)                     | ![100%](https://geps.dev/progress/100)   |
| Greek (Ελληνικά) (el_GR)                     | ![98%](https://geps.dev/progress/98)   |
| Hindi (हिंदी) (hi_IN)                          | ![99%](https://geps.dev/progress/99)   |
| Hungarian (Magyar) (hu_HU)                   | ![96%](https://geps.dev/progress/96)   |
| Indonesian (Bahasa Indonesia) (id_ID)        | ![87%](https://geps.dev/progress/87)   |
| Irish (Gaeilge) (ga_IE)                      | ![79%](https://geps.dev/progress/79)   |
| Italian (Italiano) (it_IT)                   | ![99%](https://geps.dev/progress/99)   |
| Japanese (日本語) (ja_JP)                    | ![90%](https://geps.dev/progress/90)   |
| Korean (한국어) (ko_KR)                      | ![99%](https://geps.dev/progress/99)   |
| Norwegian (Norsk) (no_NB)                    | ![79%](https://geps.dev/progress/79)   |
| Persian (فارسی) (fa_IR)                      | ![95%](https://geps.dev/progress/95)   |
| Polish (Polski) (pl_PL)                      | ![86%](https://geps.dev/progress/86)   |
| Portuguese (Português) (pt_PT)               | ![98%](https://geps.dev/progress/98)   |
| Portuguese Brazilian (Português) (pt_BR)     | ![97%](https://geps.dev/progress/97)   |
| Romanian (Română) (ro_RO)                    | ![81%](https://geps.dev/progress/81)   |
| Russian (Русский) (ru_RU)                    | ![99%](https://geps.dev/progress/99)   |
| Serbian Latin alphabet (Srpski) (sr_LATN_RS) | ![64%](https://geps.dev/progress/64)   |
| Simplified Chinese (简体中文) (zh_CN)         | ![90%](https://geps.dev/progress/90)   |
| Slovakian (Slovensky) (sk_SK)                | ![75%](https://geps.dev/progress/75)   |
| Slovenian (Slovenščina) (sl_SI)              | ![97%](https://geps.dev/progress/97)   |
| Spanish (Español) (es_ES)                    | ![87%](https://geps.dev/progress/87)   |
| Swedish (Svenska) (sv_SE)                    | ![87%](https://geps.dev/progress/87)   |
| Thai (ไทย) (th_TH)                           | ![86%](https://geps.dev/progress/86)   |
| Tibetan (བོད་ཡིག་) (zh_BO)                     | ![95%](https://geps.dev/progress/95) |
| Traditional Chinese (繁體中文) (zh_TW)        | ![99%](https://geps.dev/progress/99)   |
| Turkish (Türkçe) (tr_TR)                     | ![83%](https://geps.dev/progress/83)   |
| Ukrainian (Українська) (uk_UA)               | ![73%](https://geps.dev/progress/73)   |
| Vietnamese (Tiếng Việt) (vi_VN)              | ![80%](https://geps.dev/progress/80)   |


## Stirling PDF Enterprise

Stirling PDF offers an Enterprise edition of its software. This is the same great software but with added features, support and comforts.
Check out our [Enterprise docs](https://docs.stirlingpdf.com/Enterprise%20Edition)


## 🤝 Looking to contribute?

<<<<<<< HEAD
There are two options for this, either using the generated settings file ``settings.yml``
This file is located in the ``/configs`` directory and follows standard YAML formatting

Environment variables are also supported and would override the settings file
For example in the settings.yml you have

```yaml
security:
  enableLogin: 'true'
```

To have this via an environment variable you would have ``SECURITY_ENABLELOGIN``

The Current list of settings is

```yaml
security:
  enableLogin: false # set to 'true' to enable login
  csrfDisabled: true # Set to 'true' to disable CSRF protection (not recommended for production)
  loginAttemptCount: 5 # lock user account after 5 tries; when using e.g. Fail2Ban you can deactivate the function with -1
  loginResetTimeMinutes: 120 # lock account for 2 hours after x attempts
  loginMethod: all # 'all' (Login Username/Password and OAuth2[must be enabled and configured]), 'normal'(only Login with Username/Password) or 'oauth2'(only Login with OAuth2)
  initialLogin:
    username: '' # Initial username for the first login
    password: '' # Initial password for the first login
  oauth2:
    enabled: false # set to 'true' to enable login (Note: enableLogin must also be 'true' for this to work)
    client:
      keycloak:
        issuer: '' # URL of the Keycloak realm's OpenID Connect Discovery endpoint
        clientId: '' # Client ID for Keycloak OAuth2
        clientSecret: '' # Client Secret for Keycloak OAuth2
        scopes: openid, profile, email # Scopes for Keycloak OAuth2
        useAsUsername: preferred_username # Field to use as the username for Keycloak OAuth2
      google:
        clientId: '' # Client ID for Google OAuth2
        clientSecret: '' # Client Secret for Google OAuth2
        scopes: https://www.googleapis.com/auth/userinfo.email, https://www.googleapis.com/auth/userinfo.profile # Scopes for Google OAuth2
        useAsUsername: email # Field to use as the username for Google OAuth2
      github:
        clientId: '' # Client ID for GitHub OAuth2
        clientSecret: '' # Client Secret for GitHub OAuth2
        scopes: read:user # Scope for GitHub OAuth2
        useAsUsername: login # Field to use as the username for GitHub OAuth2
    issuer: '' # set to any provider that supports OpenID Connect Discovery (/.well-known/openid-configuration) end-point
    clientId: '' # Client ID from your provider
    clientSecret: '' # Client Secret from your provider
    autoCreateUser: false # set to 'true' to allow auto-creation of non-existing users
    blockRegistration: false # set to 'true' to deny login with SSO without prior registration by an admin
    useAsUsername: email # Default is 'email'; custom fields can be used as the username
    scopes: openid, profile, email # Specify the scopes for which the application will request permissions
    provider: google # Set this to your OAuth provider's name, e.g., 'google' or 'keycloak'

system:
  defaultLocale: 'en-US' # Set the default language (e.g. 'de-DE', 'fr-FR', etc)
  googlevisibility: false # 'true' to allow Google visibility (via robots.txt), 'false' to disallow
  enableAlphaFunctionality: false # Set to enable functionality which might need more testing before it fully goes live (This feature might make no changes)
  showUpdate: true # see when a new update is available
  showUpdateOnlyAdmin: false # Only admins can see when a new update is available, depending on showUpdate it must be set to 'true'
  customHTMLFiles: false # enable to have files placed in /customFiles/templates override the existing template html files

ui:
  appName: '' # Application's visible name
  homeDescription: '' # Short description or tagline shown on homepage.
  appNameNavbar: '' # Name displayed on the navigation bar

endpoints:
  toRemove: [] # List endpoints to disable (e.g. ['img-to-pdf', 'remove-pages'])
  groupsToRemove: [] # List groups to disable (e.g. ['LibreOffice'])

metrics:
  enabled: true # 'true' to enable Info APIs (`/api/*`) endpoints, 'false' to disable
```

There is an additional config file ``/configs/custom_settings.yml`` were users familiar with java and spring application.properties can input their own settings on-top of Stirling-PDFs existing ones

### Extra notes

- Endpoints. Currently, the endpoints ENDPOINTS_TO_REMOVE and GROUPS_TO_REMOVE can include comma separate lists of endpoints and groups to disable as example ENDPOINTS_TO_REMOVE=img-to-pdf,remove-pages would disable both image-to-pdf and remove pages, GROUPS_TO_REMOVE=LibreOffice Would disable all things that use LibreOffice. You can see a list of all endpoints and groups [here](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/Endpoint-groups.md)
- customStaticFilePath. Customise static files such as the app logo by placing files in the /customFiles/static/ directory. An example of customising app logo is placing a /customFiles/static/favicon.svg to override current SVG. This can be used to change any images/icons/css/fonts/js etc in Stirling-PDF

### Environment only parameters

- ``SYSTEM_ROOTURIPATH`` ie set to ``/pdf-app`` to Set the application's root URI to ``localhost:8080/pdf-app``
- ``SYSTEM_CONNECTIONTIMEOUTMINUTES`` to set custom connection timeout values
- ``DOCKER_ENABLE_SECURITY`` to tell docker to download security jar (required as true for auth login)
- ``INSTALL_BOOK_AND_ADVANCED_HTML_OPS`` to download calibre onto stirling-pdf enabling pdf to/from book and advanced html conversion
- ``LANGS`` to define custom font libraries to install for use for document conversions

## API

For those wanting to use Stirling-PDFs backend API to link with their own custom scripting to edit PDFs you can view all existing API documentation
[here](https://app.swaggerhub.com/apis-docs/Stirling-Tools/Stirling-PDF/) or navigate to /swagger-ui/index.html of your stirling-pdf instance for your versions documentation (Or by following the API button in your settings of Stirling-PDF)

## Login authentication

![stirling-login](images/login-light.png)

### Prerequisites

- User must have the folder ./configs volumed within docker so that it is retained during updates.
- Docker users must download the security jar version by setting ``DOCKER_ENABLE_SECURITY`` to ``true`` in environment variables.
- Then either enable login via the settings.yml file or via setting ``SECURITY_ENABLE_LOGIN`` to ``true``
- Now the initial user will be generated with username ``admin`` and password ``stirling``. On login you will be forced to change the password to a new one. You can also use the environment variables ``SECURITY_INITIALLOGIN_USERNAME`` and  ``SECURITY_INITIALLOGIN_PASSWORD`` to set your own straight away (Recommended to remove them after user creation).

Once the above has been done, on restart, a new stirling-pdf-DB.mv.db will show if everything worked.

When you login to Stirling PDF you will be redirected to /login page to login with those default credentials. After login everything should function as normal

To access your account settings go to Account settings in the settings cog menu (top right in navbar) This Account settings menu is also where you find your API key.

To add new users go to the bottom of Account settings and hit 'Admin Settings', here you can add new users. The different roles mentioned within this are for rate limiting. This is a Work in progress which will be expanding on more in future

For API usage you must provide a header with 'X-API-Key' and the associated API key for that user.

## Konfuzio.com Deployment

This repo is publically served via konfuzio.com/tools. A Cloudflare Worker (https://dash.cloudflare.com/c3a4e203bd542436b2abc5f2a93bb812/workers/services/edit/konfuzio-pdf-tools/production) is used to redirect traffic to "/tools".

```
const myBlog = {
  hostname: "tools.konfuzio.com",
  targetSubdirectory: "/tools"
}

async function handleRequest(request) {
  const parsedUrl = new URL(request.url);
  const requestMatches = match => new RegExp(match).test(parsedUrl.pathname);
  
  // Create a new URL based on the condition
  const targetUrl = requestMatches(myBlog.targetSubdirectory) ? 
                    `https://${myBlog.hostname}${parsedUrl.pathname}` : 
                    request.url;
  
  // Check if the request is a POST request
  if (request.method === "POST") {
    // Forward the POST request with its body and headers
    const response = await fetch(targetUrl, {
      method: 'POST', // Set method to POST
      headers: request.headers, // Forward the headers
      body: request.body // Forward the body
    });
    return response;
  }
  
  // For other types of requests (GET, PUT, DELETE, etc.), simply forward the request as is
  return fetch(targetUrl, {
    method: request.method, // Use the original request method
    headers: request.headers // Forward the headers
  });
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});
```

## FAQ

### Q1: What are your planned features?

- Progress bar/Tracking
- Full custom logic pipelines to combine multiple operations together.
- Folder support with auto scanning to perform operations on
- Redact text (Via UI not just automated way)
- Add Forms
- Multi page layout (Stich PDF pages together) support x rows y columns and custom page sizing
- Fill forms manually or automatically

### Q2: Why is my application downloading .htm files?

This is an issue caused commonly by your NGINX configuration. The default file upload size for NGINX is 1MB, you need to add the following in your Nginx sites-available file. ``client_max_body_size SIZE;`` Where "SIZE" is 50M for example for 50MB files.

### Q3: Why is my download timing out

NGINX has timeout values by default so if you are running Stirling-PDF behind NGINX you may need to set a timeout value such as adding the config ``proxy_read_timeout 3600;``
