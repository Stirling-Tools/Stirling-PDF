<p align="center"><img src="https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/main/docs/stirling.png" width="80"></p>
<h1 align="center">Stirling-PDF</h1>

[![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf)](https://hub.docker.com/r/frooodle/s-pdf)
[![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)](https://discord.gg/Cn8pWhQRxZ)
[![Docker Image Version (tag latest semver)](https://img.shields.io/docker/v/frooodle/s-pdf/latest)](https://github.com/Stirling-Tools/Stirling-PDF/)
[![GitHub Repo stars](https://img.shields.io/github/stars/stirling-tools/stirling-pdf?style=social)](https://github.com/Stirling-Tools/stirling-pdf)

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Stirling-Tools/Stirling-PDF/tree/digitalOcean&refcode=c3210994b1af)

[Stirling-PDF](https://www.stirlingpdf.com) is a robust, locally hosted web-based PDF manipulation tool using Docker. It enables you to carry out various operations on PDF files, including splitting, merging, converting, reorganizing, adding images, rotating, compressing, and more. This locally hosted web application has evolved to encompass a comprehensive set of features, addressing all your PDF requirements.

Stirling-PDF does not initiate any outbound calls for record-keeping or tracking purposes.

All files and PDFs exist either exclusively on the client side, reside in server memory only during task execution, or temporarily reside in a file solely for the execution of the task. Any file downloaded by the user will have been deleted from the server by that point.

![stirling-home](images/stirling-home.jpg)

## Features

- Enterprise features like SSO Check [here](https://docs.stirlingpdf.com/Enterprise%20Edition) 
- Dark mode support
- Custom download options
- Parallel file processing and downloads
- Custom 'Pipelines' to run multiple features in a queue
- API for integration with external scripts
- Optional Login and Authentication support (see [here](https://github.com/Stirling-Tools/Stirling-PDF/tree/main#login-authentication) for documentation)
- Database Backup and Import (see [here](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/DATABASE.md) for documentation)


## PDF Features

### Page Operations

- View and modify PDFs - View multi-page PDFs with custom viewing, sorting, and searching. Plus on-page edit features like annotate, draw, and adding text and images. (Using PDF.js with Joxit and Liberation fonts)
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
- Auto split PDF (with physically scanned page dividers)
- Extract page(s)
- Convert PDF to a single page
- Overlay PDFs on top of each other
- PDF to single page
- Split PDF by sections

### Conversion Operations

- Convert PDFs to and from images
- Convert any common file to PDF (using LibreOffice)
- Convert PDF to Word/PowerPoint/others (using LibreOffice)
- Convert HTML to PDF
- Convert PDF to xml
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
- Compress PDFs to decrease their filesize (using OCRMyPDF)
- Extract images from PDF
- Remove images from PDF
- Extract images from scans
- Remove annotations
- Add page numbers
- Auto rename file by detecting PDF header text
- OCR on PDF (using OCRMyPDF)
- PDF/A conversion (using OCRMyPDF)
- Edit metadata
- Flatten PDFs
- Get all information on a PDF to view or export as JSON
- Show/detect embedded JavaScript

For an overview of the tasks and the technology each uses, please view [Endpoint-groups.md](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/Endpoint-groups.md).

A demo of the app is available [here](https://stirlingpdf.io).

## Technologies Used

- Spring Boot + Thymeleaf
- [PDFBox](https://github.com/apache/pdfbox/tree/trunk)
- [LibreOffice](https://www.libreoffice.org/discover/libreoffice/) for advanced conversions
- [OcrMyPdf](https://github.com/ocrmypdf/OCRmyPDF)
- HTML, CSS, JavaScript
- Docker
- [PDF.js](https://github.com/mozilla/pdf.js)
- [PDF-LIB.js](https://github.com/Hopding/pdf-lib)

## How to Use

### Windows

For Windows users, download the latest Stirling-PDF.exe from our [release](https://github.com/Stirling-Tools/Stirling-PDF/releases) section or by clicking [here](https://github.com/Stirling-Tools/Stirling-PDF/releases/latest/download/Stirling-PDF.exe).

### Locally

Please view the [LocalRunGuide](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LocalRunGuide.md).

### Docker / Podman

> [!NOTE]
> <https://hub.docker.com/r/frooodle/s-pdf>

Stirling-PDF has three different versions: a full version, an ultra-lite version, and a 'fat' version. Depending on the types of features you use, you may want a smaller image to save on space. To see what the different versions offer, please look at our [version mapping](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/Version-groups.md). For people that don't mind space optimization, just use the latest tag.

![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest?label=Stirling-PDF%20Full)
![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest-ultra-lite?label=Stirling-PDF%20Ultra-Lite)
![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest-fat?label=Stirling-PDF%20Fat)

Please note in the examples below, you may need to change the volume paths as needed, e.g., `./extraConfigs:/configs` to `/opt/stirlingpdf/extraConfigs:/configs`.

### Docker Run

```bash
docker run -d \
  -p 8080:8080 \
  -v ./trainingData:/usr/share/tessdata \
  -v ./extraConfigs:/configs \
  -v ./logs:/logs \
# Optional customization (not required)
# -v /location/of/customFiles:/customFiles \
  -e DOCKER_ENABLE_SECURITY=false \
  -e INSTALL_BOOK_AND_ADVANCED_HTML_OPS=false \
  -e LANGS=en_GB \
  --name stirling-pdf \
  frooodle/s-pdf:latest
```

### Docker Compose

```yaml
version: '3.3'
services:
  stirling-pdf:
    image: frooodle/s-pdf:latest
    ports:
      - '8080:8080'
    volumes:
      - ./trainingData:/usr/share/tessdata # Required for extra OCR languages
      - ./extraConfigs:/configs
#      - ./customFiles:/customFiles/
#      - ./logs:/logs/
    environment:
      - DOCKER_ENABLE_SECURITY=false
      - INSTALL_BOOK_AND_ADVANCED_HTML_OPS=false
      - LANGS=en_GB
```

Note: Podman is CLI-compatible with Docker, so simply replace "docker" with "podman".

### Kubernetes

See the kubernetes helm chart [here](https://github.com/Stirling-Tools/Stirling-PDF-chart)

## Enable OCR/Compression Feature

Please view the [HowToUseOCR.md](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/HowToUseOCR.md).

## Reuse Stored Files

Certain functionality like `Sign` supports pre-saved files stored at `/customFiles/signatures/`. Image files placed within here will be accessible to be used via the web UI. Currently, this supports two folder types:

- `/customFiles/signatures/ALL_USERS`: Accessible to all users, useful for organizations where many users use the same files or for users not using authentication
- `/customFiles/signatures/{username}`: Such as `/customFiles/signatures/froodle`, accessible only to the `froodle` username, private for all others

## Supported Languages

Stirling-PDF currently supports 36 languages!

| Language                                     | Progress                               |
| -------------------------------------------- | -------------------------------------- |
| Arabic (العربية) (ar_AR)                     | ![97%](https://geps.dev/progress/97)   |
| Basque (Euskara) (eu_ES)                     | ![55%](https://geps.dev/progress/55)   |
| Bulgarian (Български) (bg_BG)                | ![96%](https://geps.dev/progress/96)   |
| Catalan (Català) (ca_CA)                     | ![90%](https://geps.dev/progress/90)   |
| Croatian (Hrvatski) (hr_HR)                  | ![98%](https://geps.dev/progress/98)   |
| Czech (Česky) (cs_CZ)                        | ![97%](https://geps.dev/progress/97)   |
| Danish (Dansk) (da_DK)                       | ![96%](https://geps.dev/progress/96)   |
| Dutch (Nederlands) (nl_NL)                   | ![96%](https://geps.dev/progress/96)   |
| English (English) (en_GB)                    | ![100%](https://geps.dev/progress/100) |
| English (US) (en_US)                         | ![100%](https://geps.dev/progress/100) |
| French (Français) (fr_FR)                    | ![97%](https://geps.dev/progress/97)   |
| German (Deutsch) (de_DE)                     | ![99%](https://geps.dev/progress/99)   |
| Greek (Ελληνικά) (el_GR)                     | ![97%](https://geps.dev/progress/97)   |
| Hindi (हिंदी) (hi_IN)                           | ![95%](https://geps.dev/progress/95)   |
| Hungarian (Magyar) (hu_HU)                   | ![98%](https://geps.dev/progress/98)   |
| Indonesian (Bahasa Indonesia) (id_ID)        | ![97%](https://geps.dev/progress/97)   |
| Irish (Gaeilge) (ga_IE)                      | ![88%](https://geps.dev/progress/88)   |
| Italian (Italiano) (it_IT)                   | ![99%](https://geps.dev/progress/99)   |
| Japanese (日本語) (ja_JP)                    | ![85%](https://geps.dev/progress/85)   |
| Korean (한국어) (ko_KR)                      | ![95%](https://geps.dev/progress/95)   |
| Norwegian (Norsk) (no_NB)                    | ![87%](https://geps.dev/progress/87)   |
| Polish (Polski) (pl_PL)                      | ![97%](https://geps.dev/progress/97)   |
| Portuguese (Português) (pt_PT)               | ![97%](https://geps.dev/progress/97)   |
| Portuguese Brazilian (Português) (pt_BR)     | ![98%](https://geps.dev/progress/98)   |
| Romanian (Română) (ro_RO)                    | ![90%](https://geps.dev/progress/90)   |
| Russian (Русский) (ru_RU)                    | ![97%](https://geps.dev/progress/97)   |
| Serbian Latin alphabet (Srpski) (sr_LATN_RS) | ![70%](https://geps.dev/progress/70)   |
| Simplified Chinese (简体中文) (zh_CN)        | ![91%](https://geps.dev/progress/91)   |
| Slovakian (Slovensky) (sk_SK)                | ![82%](https://geps.dev/progress/82)   |
| Spanish (Español) (es_ES)                    | ![98%](https://geps.dev/progress/98)   |
| Swedish (Svenska) (sv_SE)                    | ![97%](https://geps.dev/progress/97)   |
| Thai (ไทย) (th_TH)                           | ![96%](https://geps.dev/progress/96)   |
| Traditional Chinese (繁體中文) (zh_TW)       | ![98%](https://geps.dev/progress/98)   |
| Turkish (Türkçe) (tr_TR)                     | ![92%](https://geps.dev/progress/92)   |
| Ukrainian (Українська) (uk_UA)               | ![80%](https://geps.dev/progress/80)   |
| Vietnamese (Tiếng Việt) (vi_VN)              | ![88%](https://geps.dev/progress/88)   |

## Contributing (Creating Issues, Translations, Fixing Bugs, etc.)

Please see our [Contributing Guide](CONTRIBUTING.md).

## Stirling PDF Enterprise

Stirling PDF offers a Enterprise edition of its software, This is the same great software but with added features and comforts

### Whats included

- Prioritised Support tickets via support@stirlingpdf.com to reach directly to Stirling-PDF team for support and 1:1 meetings where applicable (Provided they come from same email domain registered with us)
- Prioritised Enhancements to Stirling-PDF where applicable 
- Base SSO support
- Advanced SSO such as automated login handling (Coming very soon)
- SAML SSO (Coming very soon)
- Custom automated metadata handling
- Advanced user configurations (Coming soon)
- Plus other exciting features to come

Check out of [docs](https://docs.stirlingpdf.com/Enterprise%20Edition) on it or our official [website](https://www.stirlingpdf.com)

## Customization

Stirling-PDF allows easy customization of the app, including things like:

- Custom application name
- Custom slogans, icons, HTML, images, CSS, etc. (via file overrides)

There are two options for this, either using the generated settings file `settings.yml`, which is located in the `/configs` directory and follows standard YAML formatting, or using environment variables, which would override the settings file.

For example, in `settings.yml`, you might have:

```yaml
security:
  enableLogin: 'true'
```

To have this via an environment variable, you would use `SECURITY_ENABLELOGIN`.

The current list of settings is:

```yaml
security:
  enableLogin: false # set to 'true' to enable login
  csrfDisabled: true # set to 'true' to disable CSRF protection (not recommended for production)
  loginAttemptCount: 5 # lock user account after 5 tries; when using e.g. Fail2Ban you can deactivate the function with -1
  loginResetTimeMinutes: 120 # lock account for 2 hours after x attempts
  loginMethod: all # 'all' (Login Username/Password and OAuth2[must be enabled and configured]), 'normal'(only Login with Username/Password) or 'oauth2'(only Login with OAuth2)
  initialLogin:
    username: '' # initial username for the first login
    password: '' # initial password for the first login
  oauth2:
    enabled: false # set to 'true' to enable login (Note: enableLogin must also be 'true' for this to work)
    client:
      keycloak:
        issuer: '' # URL of the Keycloak realm's OpenID Connect Discovery endpoint
        clientId: '' # client ID for Keycloak OAuth2
        clientSecret: '' # client secret for Keycloak OAuth2
        scopes: openid, profile, email # scopes for Keycloak OAuth2
        useAsUsername: preferred_username # field to use as the username for Keycloak OAuth2
      google:
        clientId: '' # client ID for Google OAuth2
        clientSecret: '' # client secret for Google OAuth2
        scopes: https://www.googleapis.com/auth/userinfo.email, https://www.googleapis.com/auth/userinfo.profile # scopes for Google OAuth2
        useAsUsername: email # field to use as the username for Google OAuth2
      github:
        clientId: '' # client ID for GitHub OAuth2
        clientSecret: '' # client secret for GitHub OAuth2
        scopes: read:user # scope for GitHub OAuth2
        useAsUsername: login # field to use as the username for GitHub OAuth2
    issuer: '' # set to any provider that supports OpenID Connect Discovery (/.well-known/openid-configuration) endpoint
    clientId: '' # client ID from your provider
    clientSecret: '' # client secret from your provider
    autoCreateUser: false # set to 'true' to allow auto-creation of non-existing users
    blockRegistration: false # set to 'true' to deny login with SSO without prior registration by an admin
    useAsUsername: email # default is 'email'; custom fields can be used as the username
    scopes: openid, profile, email # specify the scopes for which the application will request permissions
    provider: google # set this to your OAuth provider's name, e.g., 'google' or 'keycloak'
  saml2:
    enabled: false # currently in alpha, not recommended for use yet, enableAlphaFunctionality must be set to true
    autoCreateUser: false # set to 'true' to allow auto-creation of non-existing users
    blockRegistration: false # set to 'true' to deny login with SSO without prior registration by an admin
    registrationId: stirling
    idpMetadataUri: https://dev-XXXXXXXX.okta.com/app/externalKey/sso/saml/metadata
    idpSingleLogoutUrl: https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/slo/saml
    idpSingleLoginUrl: https://dev-XXXXXXXX.okta.com/app/dev-XXXXXXXX_stirlingpdf_1/externalKey/sso/saml
    idpIssuer: http://www.okta.com/externalKey
    idpCert: classpath:okta.crt
    privateKey: classpath:saml-private-key.key
    spCert: classpath:saml-public-cert.crt

enterpriseEdition:
  enabled: false # set to 'true' to enable enterprise edition
  key: 00000000-0000-0000-0000-000000000000
  CustomMetadata:
    autoUpdateMetadata: false # set to 'true' to automatically update metadata with below values
    author: username # supports text such as 'John Doe' or types such as username to autopopulate with user's username
    creator: Stirling-PDF # supports text such as 'Company-PDF'
    producer: Stirling-PDF # supports text such as 'Company-PDF'

legal:
  termsAndConditions: https://www.stirlingpdf.com/terms-and-conditions # URL to the terms and conditions of your application (e.g. https://example.com/terms). Empty string to disable or filename to load from local file in static folder
  privacyPolicy: https://www.stirlingpdf.com/privacy-policy # URL to the privacy policy of your application (e.g. https://example.com/privacy). Empty string to disable or filename to load from local file in static folder
  accessibilityStatement: '' # URL to the accessibility statement of your application (e.g. https://example.com/accessibility). Empty string to disable or filename to load from local file in static folder
  cookiePolicy: '' # URL to the cookie policy of your application (e.g. https://example.com/cookie). Empty string to disable or filename to load from local file in static folder
  impressum: '' # URL to the impressum of your application (e.g. https://example.com/impressum). Empty string to disable or filename to load from local file in static folder

system:
  defaultLocale: en-US # set the default language (e.g. 'de-DE', 'fr-FR', etc)
  googlevisibility: false # 'true' to allow Google visibility (via robots.txt), 'false' to disallow
  enableAlphaFunctionality: false # set to enable functionality which might need more testing before it fully goes live (this feature might make no changes)
  showUpdate: false # see when a new update is available
  showUpdateOnlyAdmin: false # only admins can see when a new update is available, depending on showUpdate it must be set to 'true'
  customHTMLFiles: false # enable to have files placed in /customFiles/templates override the existing template HTML files
  tessdataDir: /usr/share/tessdata # path to the directory containing the Tessdata files. This setting is relevant for Windows systems. For Windows users, this path should be adjusted to point to the appropriate directory where the Tessdata files are stored.
  enableAnalytics: undefined # set to 'true' to enable analytics, set to 'false' to disable analytics; for enterprise users, this is set to true

ui:
  appName: '' # application's visible name
  homeDescription: '' # short description or tagline shown on the homepage
  appNameNavbar: '' # name displayed on the navigation bar

endpoints:
  toRemove: [] # list endpoints to disable (e.g. ['img-to-pdf', 'remove-pages'])
  groupsToRemove: [] # list groups to disable (e.g. ['LibreOffice'])

metrics:
  enabled: true # 'true' to enable Info APIs (`/api/*`) endpoints, 'false' to disable

# Automatically Generated Settings (Do Not Edit Directly)
AutomaticallyGenerated:
  key: example
  UUID: example
```

There is an additional config file `/configs/custom_settings.yml` where users familiar with Java and Spring `application.properties` can input their own settings on top of Stirling-PDF's existing ones.



### Extra Notes

- **Endpoints**: Currently, the `ENDPOINTS_TO_REMOVE` and `GROUPS_TO_REMOVE` endpoints can include comma-separated lists of endpoints and groups to disable. For example, `ENDPOINTS_TO_REMOVE=img-to-pdf,remove-pages` would disable both image-to-pdf and remove pages, while `GROUPS_TO_REMOVE=LibreOffice` would disable all things that use LibreOffice. You can see a list of all endpoints and groups [here](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/Endpoint-groups.md).
- **customStaticFilePath**: Customize static files such as the app logo by placing files in the `/customFiles/static/` directory. An example of customizing the app logo is placing `/customFiles/static/favicon.svg` to override the current SVG. This can be used to change any `images/icons/css/fonts/js`, etc. in Stirling-PDF.

### Environment-Only Parameters

- `SYSTEM_ROOTURIPATH` - Set the application's root URI (e.g. `/pdf-app` to set the root URI to `localhost:8080/pdf-app`)
- `SYSTEM_CONNECTIONTIMEOUTMINUTES` - Set custom connection timeout values
- `DOCKER_ENABLE_SECURITY` - Set to `true` to download security jar (required for authentication login)
- `INSTALL_BOOK_AND_ADVANCED_HTML_OPS` - Download Calibre onto Stirling-PDF to enable PDF to/from book and advanced HTML conversion
- `LANGS` - Define custom font libraries to install for document conversions

## API

For those wanting to use Stirling-PDF's backend API to link with their own custom scripting to edit PDFs, you can view all existing API documentation [here](https://app.swaggerhub.com/apis-docs/Stirling-Tools/Stirling-PDF/), or navigate to `/swagger-ui/index.html` of your Stirling-PDF instance for your version's documentation (or by following the API button in the settings of Stirling-PDF).

## Login Authentication

![stirling-login](images/login-light.png)

### Prerequisites

- User must have the folder `./configs` volumed within Docker so that it is retained during updates.
- Docker users must download the security jar version by setting `DOCKER_ENABLE_SECURITY` to `true` in environment variables.
- Then either enable login via the `settings.yml` file or set `SECURITY_ENABLE_LOGIN` to `true`.
- Now the initial user will be generated with username `admin` and password `stirling`. On login, you will be forced to change the password to a new one. You can also use the environment variables `SECURITY_INITIALLOGIN_USERNAME` and `SECURITY_INITIALLOGIN_PASSWORD` to set your own credentials straight away (recommended to remove them after user creation).

Once the above has been done, on restart, a new `stirling-pdf-DB.mv.db` will show if everything worked.

When you log in to Stirling-PDF, you will be redirected to the `/login` page to log in with those default credentials. After login, everything should function as normal.

To access your account settings, go to Account Settings in the settings cog menu (top right in the navbar). This Account Settings menu is also where you find your API key.

To add new users, go to the bottom of Account Settings and hit 'Admin Settings'. Here you can add new users. The different roles mentioned within this are for rate limiting. This is a work in progress and will be expanded on more in the future.

For API usage, you must provide a header with `X-API-Key` and the associated API key for that user.

## FAQ

### Q1: What are your planned features?

- Progress bar/tracking
- Full custom logic pipelines to combine multiple operations together
- Folder support with auto-scanning to perform operations on
- Redact text (via UI, not just automated)
- Add forms
- Multi-page layout (stitch PDF pages together) support x rows y columns and custom page sizing
- Fill forms manually or automatically

### Q2: Why is my application downloading .htm files? Why am i getting HTTP error 413?

This is an issue commonly caused by your NGINX configuration. The default file upload size for NGINX is 1MB. You need to add the following in your Nginx sites-available file: `client_max_body_size SIZE;` (where "SIZE" is 50M for example for 50MB files).

### Q3: Why is my download timing out?

NGINX has timeout values by default, so if you are running Stirling-PDF behind NGINX, you may need to set a timeout value, such as adding the config `proxy_read_timeout 3600;`.
