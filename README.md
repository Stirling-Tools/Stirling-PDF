<p align="center"><img src="https://raw.githubusercontent.com/Frooodle/Stirling-PDF/main/docs/stirling.png" width="80" ><br><h1 align="center">Stirling-PDF</h1>
</p>

[![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf)](https://hub.docker.com/r/frooodle/s-pdf)
[![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)](https://discord.gg/Cn8pWhQRxZ)
[![Docker Image Version (tag latest semver)](https://img.shields.io/docker/v/frooodle/s-pdf/latest)](https://github.com/Frooodle/Stirling-PDF/)
[![GitHub Repo stars](https://img.shields.io/github/stars/frooodle/stirling-pdf?style=social)](https://github.com/Frooodle/stirling-pdf)
[![Paypal Donate](https://img.shields.io/badge/Paypal%20Donate-yellow?style=flat&logo=paypal)](https://www.paypal.com/paypalme/froodleplex)
[![Github Sponser](https://img.shields.io/badge/Github%20Sponsor-yellow?style=flat&logo=github)](https://github.com/sponsors/Frooodle)

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/Frooodle/Stirling-PDF/tree/digitalOcean&refcode=c3210994b1af)

This is a powerful locally hosted web based PDF manipulation tool using docker that allows you to perform various operations on PDF files, such as splitting merging, converting, reorganizing, adding images, rotating, compressing, and more. This locally hosted web application started as a 100% ChatGPT-made application and has evolved to include a wide range of features to handle all your PDF needs.

Stirling PDF makes no outbound calls for any record keeping or tracking.

All files and PDFs are either purely client side, in server memory only during the execution of the task or within a temporay file only for execution of the task.
Any file which has been downloaded by the user will have already been deleted from the server by that time.

Feel free to request any features or bug fixes either in github issues or our [Discord](https://discord.gg/Cn8pWhQRxZ)

![stirling-home](images/stirling-home.png)

## Features
- Dark mode support.
- Custom download options (see [here](https://github.com/Frooodle/Stirling-PDF/blob/main/images/settings.png) for example)
- Parallel file processing and downloads
- API for integration with external scripts 
- Optional Login and Authentication support (see [here](https://github.com/Frooodle/Stirling-PDF/tree/main#login-authentication) for documentation)


## **PDF Features**

### **Page Operations**
- View and modify PDFs - View multi page PDFs with custom viewing sorting and searching. Plus on page edit features like annotate, draw and adding text and images. (Using PDF.js with Joxit and Liberation.Liberation fonts)
- Full interactive GUI for merging/splitting/rotating/moving PDFs and their pages. 
- Merge multiple PDFs together into a single resultant file. 
- Split PDFs into multiple files at specified page numbers or extract all pages as individual files. 
- Reorganize PDF pages into different orders. 
- Rotate PDFs in 90-degree increments. 
- Remove pages. 
- Multi-page layout (Format PDFs into a multi-paged page). 
- Scale page contents size by set %. 
- Adjust Contrast. 
- Crop PDF. 
- Auto Split PDF (With physically scanned page dividers). 
- Extract page(s). 
- Convert PDF to a single page. 

### **Conversion Operations**
- Convert PDFs to and from images. 
- Convert any common file to PDF (using LibreOffice). 
- Convert PDF to Word/Powerpoint/Others (using LibreOffice). 
- Convert HTML to PDF. 
- URL to PDF. 
- Markdown to PDF. 

### **Security & Permissions**
- Add and remove passwords. 
- Change/set PDF Permissions. 
- Add watermark(s). 
- Certify/sign PDFs. 
- Sanitize PDFs. 
- Auto-redact text. 

### **Other Operations**
- Add/Generate/Write signatures. 
- Repair PDFs. 
- Detect and remove blank pages. 
- Compare 2 PDFs and show differences in text. 
- Add images to PDFs. 
- Compress PDFs to decrease their filesize (Using OCRMyPDF). 
- Extract images from PDF. 
- Extract images from Scans. 
- Add page numbers. 
- Auto rename file by detecting PDF header text. 
- OCR on PDF (Using OCRMyPDF). 
- PDF/A conversion (Using OCRMyPDF). 
- Edit metadata. 
- Flatten PDFs. 
- Get all information on a PDF to view or export as JSON. 


For a overview of the tasks and the technology each uses please view [Endpoint-groups.md](https://github.com/Frooodle/Stirling-PDF/blob/main/Endpoint-groups.md)
Hosted instance/demo of the app can be seen [here](https://pdf.adminforge.de/) hosted by the team at adminforge.de

## Technologies used
- Spring Boot + Thymeleaf
- PDFBox
- [LibreOffice](https://www.libreoffice.org/discover/libreoffice/) for advanced conversions
- [OcrMyPdf](https://github.com/ocrmypdf/OCRmyPDF)
- HTML, CSS, JavaScript
- Docker
- PDF.js
- PDF-LIB.js

## How to use

### Locally
Please view https://github.com/Frooodle/Stirling-PDF/blob/main/LocalRunGuide.md

### Docker / Podman
https://hub.docker.com/r/frooodle/s-pdf

Stirling PDF has 3 different versions, a Full version, Lite, and ultra-Lite. Depending on the types of features you use you may want a smaller image to save on space.
To see what the different versions offer please look at our [version mapping](https://github.com/Frooodle/Stirling-PDF/blob/main/Version-groups.md)
For people that don't mind about space optimization just use the latest tag.
![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest?label=Stirling-PDF%20Full)
![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest-lite?label=Stirling-PDF%20Lite)
![Docker Image Size (tag)](https://img.shields.io/docker/image-size/frooodle/s-pdf/latest-ultra-lite?label=Stirling-PDF%20Ultra-Lite)

Docker Run
```
docker run -d \
  -p 8080:8080 \
  -v /location/of/trainingData:/usr/share/tesseract-ocr/4.00/tessdata \
  -v /location/of/extraConfigs:/configs \
  -e DOCKER_ENABLE_SECURITY=false \
  --name stirling-pdf \
  frooodle/s-pdf:latest
  
  
  Can also add these for customisation but are not required
  
  -v /location/of/customFiles:/customFiles \
```
Docker Compose
```
version: '3.3'
services:
  stirling-pdf:
    image: frooodle/s-pdf:latest
    container_name: stirling-pdf
    ports:
      - '8080:8080'
    volumes:
      - /location/of/trainingData:/usr/share/tesseract-ocr/4.00/tessdata #Required for extra OCR languages
      - /location/of/extraConfigs:/configs
#      - /location/of/customFiles:/customFiles/
    environment:
      - DOCKER_ENABLE_SECURITY=false
    healthcheck: # optional: remember to adapt the host:port to your environment
        test: ["CMD-SHELL", "/bin/bash set -o pipefail; curl --insecure --silent -m 2 https://localhost:443/ | grep 'Your locally hosted one-stop-shop for all your PDF needs.' || exit 1"]
        interval: 60s
        timeout: 10s
        retries: 3
        start_period: 40s
```

Note: Podman is CLI-compatible with Docker, so simply replace "docker" with "podman".

## Enable OCR/Compression feature
Please view https://github.com/Frooodle/Stirling-PDF/blob/main/HowToUseOCR.md

## Want to add your own language?
Stirling PDF currently supports 20!
- English (English) (en_GB)
- English (US) (en_US)
- Arabic (العربية) (ar_AR)
- German (Deutsch) (de_DE)
- French (Français) (fr_FR)
- Spanish (Español) (es_ES)
- Chinese (简体中文) (zh_CN)
- Catalan (Català) (ca_CA)
- Italian (Italiano) (it_IT)
- Swedish (Svenska) (sv_SE)
- Polish (Polski) (pl_PL)
- Romanian (Română) (ro_RO)
- Korean (한국어) (ko_KR)
- Portuguese Brazilian (Português) (pt_BR)
- Russian (Русский) (ru_RU)
- Basque (Euskara) (eu_ES)
- Japanese (日本語) (ja_JP)
- Dutch (Nederlands) (nl_NL)
- Greek (el_GR)
- Turkish (Türkçe) (tr_TR)

If you want to add your own language to Stirling-PDF please refer
https://github.com/Frooodle/Stirling-PDF/blob/main/HowToAddNewLanguage.md

And please create a PR to merge it back in so others can use it! 

## How to View
1. Open a web browser and navigate to `http://localhost:8080/`
2. Use the application by following the instructions on the website.


## Customisation
Stirling PDF allows easy customization of the app.
Includes things like
- Custom application name
- Custom slogans, icons, images, and even custom HTML (via file overrides)


There are two options for this, either using the generated settings file ``settings.yml``
This file is located in the ``/configs`` directory and follows standard YAML formatting

Environment variables are also supported and would override the settings file
For example in the settings.yml you have
```
system:
  defaultLocale: 'en-US'
```

To have this via an environment variable you would have ``SYSTEM_DEFAULTLOCALE``

The Current list of settings is
```
security:
  enableLogin: false # set to 'true' to enable login
  csrfDisabled: true

system:
  defaultLocale: 'en-US' # Set the default language (e.g. 'de-DE', 'fr-FR', etc)
  googlevisibility: false # 'true' to allow Google visibility (via robots.txt), 'false' to disallow
  customStaticFilePath: '/customFiles/static/' # Directory path for custom static files

#ui:
#  appName: exampleAppName # Application's visible name
#  homeDescription: I am a description # Short description or tagline shown on homepage.
#  appNameNavbar: navbarName # Name displayed on the navigation bar

endpoints:
  toRemove: [] # List endpoints to disable (e.g. ['img-to-pdf', 'remove-pages'])
  groupsToRemove: [] # List groups to disable (e.g. ['LibreOffice'])

metrics:
  enabled: true # 'true' to enable Info APIs endpoints (view http://localhost:8080/swagger-ui/index.html#/API to learn more), 'false' to disable
```
### Extra notes
- Endpoints. Currently, the endpoints ENDPOINTS_TO_REMOVE and GROUPS_TO_REMOVE can include comma separate lists of endpoints and groups to disable as example ENDPOINTS_TO_REMOVE=img-to-pdf,remove-pages would disable both image-to-pdf and remove pages, GROUPS_TO_REMOVE=LibreOffice Would disable all things that use LibreOffice. You can see a list of all endpoints and groups [here](https://github.com/Frooodle/Stirling-PDF/blob/main/Endpoint-groups.md) 
- customStaticFilePath. Customise static files such as the app logo by placing files in the /customFiles/static/ directory. An example of customising app logo is placing a /customFiles/static/favicon.svg to override current SVG. This can be used to change any images/icons/css/fonts/js etc in Stirling-PDF

### Environment only parameters
- ``SYSTEM_ROOTURIPATH`` ie set to ``/pdf-app`` to Set the application's root URI to ``localhost:8080/pdf-app``
- ``SYSTEM_CONNECTIONTIMEOUTMINUTES`` to set custom connection timeout values
- ``DOCKER_ENABLE_SECURITY`` to tell docker to download security jar (required as true for auth login)

## API
For those wanting to use Stirling-PDFs backend API to link with their own custom scripting to edit PDFs you can view all existing API documentation
[here](https://app.swaggerhub.com/apis-docs/Frooodle/Stirling-PDF/) or navigate to /swagger-ui/index.html of your stirling-pdf instance for your versions documentation (Or by following the API button in your settings of Stirling-PDF)


## Login authentication
![stirling-login](images/login-light.png)
### Prerequisites: 
- User must have the folder ./configs volumed within docker so that it is retained during updates.
- Docker uses must download the security jar version by setting ``DOCKER_ENABLE_SECURITY`` to ``true`` in environment variables. 
- Then either enable login via the settings.yml file or via setting ``SECURITY_ENABLE_LOGIN`` to ``true``
- Now the initial user will be generated with username ``admin`` and password ``stirling``. On login you will be forced to change the password to a new one. You can also use the environment variables ``SECURITY_INITIALLOGIN_USERNAME`` and  ``SECURITY_INITIALLOGIN_PASSWORD`` to set your own straight away (Recommended to remove them after user creation).

Once the above has been done, on restart, a new stirling-pdf-DB.mv.db will show if everything worked.

When you login to Stirling PDF you will be redirected to /login page to login with those default credentials. After login everything should function as normal

To access your account settings go to Account settings in the settings cog menu (top right in navbar) This Account settings menu is also where you find your API key.

To add new users go to the bottom of Account settings and hit 'Admin Settings', here you can add new users. The different roles mentioned within this are for rate limiting. This is a Work in progress which will be expanding on more in future

For API usage you must provide a header with 'X-API-Key' and the associated API key for that user.


## FAQ

### Q1: What are your planned features?
- Progress bar/Tracking
- Full custom logic pipelines to combine multiple operations together.
- Folder support with auto scanning to perform operations on
- Redact text (Via UI not just automated way) 
- Add Forms
- Multi page layout (Stich PDF pages together) support x rows y columns and custom page sizing 
- Fill forms mannual and automatic 

### Q2: Why is my application downloading .htm files?
This is a issue caused commonly by your NGINX congifuration. The default file upload size for NGINX is 1MB, you need to add the following in your Nginx sites-available file. ``client_max_body_size SIZE;`` Where "SIZE" is 50M for example for 50MB files.

### Q3: Why is my download timing out
NGINX has timeout values by default so if you are running Stirling-PDF behind NGINX you may need to set a timeout value such as adding the config ``proxy_read_timeout 3600;``
