<p align="center"><img src="https://raw.githubusercontent.com/Frooodle/Stirling-PDF/main/docs/stirling.png" width="80" ><br><h1 align="center">Stirling-PDF</h1>
</p>

[![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf)](https://hub.docker.com/r/frooodle/s-pdf)
[![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)](https://discord.gg/Cn8pWhQRxZ)
[![Docker Image Version (tag latest semver)](https://img.shields.io/docker/v/frooodle/s-pdf/latest)](https://github.com/Frooodle/Stirling-PDF/)
[![GitHub Repo stars](https://img.shields.io/github/stars/frooodle/stirling-pdf?style=social)](https://github.com/Frooodle/stirling-pdf)
[![Paypal Donate](https://img.shields.io/badge/Paypal%20Donate-yellow?style=flat&logo=paypal)](https://www.paypal.com/paypalme/froodleplex)

This is a locally hosted web application that allows you to perform various operations on PDF files, such as splitting and adding images.

Started off as a 100% ChatGPT made application, slowly moving away from that as more features are added

I will support and fix/add things to this if there is a demand [Discord](https://discord.gg/Cn8pWhQRxZ)


![stirling-home](images/stirling-home.png)

## Features

- Split PDFs into multiple files at specified page numbers or extract all pages as individual files.
- Merge multiple PDFs together into a single resultant file
- Convert PDFs to and from images
- Reorganize PDF pages into different orders.
- Add images to PDFs at specified locations. (WIP)
- Rotating PDFs in 90 degree increments.
- Compressing PDFs to decrease their filesize. (Using OCRMyPDF)
- Add and remove passwords
- Set PDF Permissions
- Add watermark(s)
- Convert Any common file to PDF (using LibreOffice)
- Extract images from PDF
- OCR on PDF (Using OCRMyPDF)
- Edit metadata
- Dark mode support.
- Custom download options (see [here](https://github.com/Frooodle/Stirling-PDF/blob/main/images/settings.png) for example)
- Parallel file processing and downloads

## Technologies used
- Spring Boot + Thymeleaf
- PDFBox
- [LibreOffice](https://www.libreoffice.org/discover/libreoffice/) for advanced conversions
- [OcrMyPdf](https://github.com/ocrmypdf/OCRmyPDF)
- HTML, CSS, JavaScript
- Docker

## How to use

### Locally

Prerequisites
- Java 17 or later
- Gradle 7.0 or later

1. Clone or download the repository.
2. Build the project using Gradle by running `./gradlew build`
3. Start the application by running `./gradlew bootRun` or by calling the build jar in build/libs with java -jar jarName.jar


### Docker
https://hub.docker.com/r/frooodle/s-pdf

Docker Run
```
docker run -p 8080:8080 frooodle/s-pdf
```
Docker Compose
```
version: '3.3'
services:
    s-pdf:
        ports:
            - '8080:8080'
        image: frooodle/s-pdf
```

## Enable OCR/Compression feature
Please view https://github.com/Frooodle/Stirling-PDF/blob/main/HowToUseOCR.md

## Want to add your own language?
If you want to add your own language to Stirling-PDF please refer
https://github.com/Frooodle/Stirling-PDF/blob/main/HowToAddNewLanguage.md

And please create a PR to merge it back in so others can use it! 

Also please note as i add new features i will google translate existing languages so that they dont lose support. This could mean that new features need grammer corrections as added.

## How to View
1. Open a web browser and navigate to `http://localhost:8080/`
2. Use the application by following the instructions on the website.


