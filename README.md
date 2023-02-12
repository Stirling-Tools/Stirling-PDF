<p align="center"><img src="https://raw.githubusercontent.com/Frooodle/Stirling-PDF/main/docs/stirling.png" width="80" ><br><h1 align="center">Stirling-PDF</h1>
</p>


This is a locally hosted web application that allows you to perform various operations on PDF files, such as splitting and adding images.

Started off as a 100% ChatGPT made application, slowly moving away from that as more features are added

I will support and fix/add things to this if there is a demand [Discord](https://discord.gg/Cn8pWhQRxZ)


![stirling-home](images/stirling-home.png)

<a href="https://hub.docker.com/r/frooodle/s-pdf">
  ![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf)
</a>

<a href="https://discord.com/invite/1068636748814483718">
  ![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)
</a>

<a href="https://github.com/Frooodle/Stirling-PDF/releases">
  ![Docker Image Version (tag latest semver)](https://img.shields.io/docker/v/frooodle/s-pdf/latest)
</a>

<a href="https://github.com/Frooodle/stirling-pdf">
  ![GitHub Repo stars](https://img.shields.io/github/stars/frooodle/stirling-pdf?style=social)
</a>

<a href="https://www.paypal.com/paypalme/froodleplex">
  ![Paypal Donate](https://img.shields.io/badge/Paypal%20Donate-yellow?style=flat&logo=paypal)
</a>


![Docker Pulls](https://img.shields.io/docker/pulls/frooodle/s-pdf?link=https://hub.docker.com/r/frooodle/s-pdf)
![Discord](https://img.shields.io/discord/1068636748814483718?label=Discord)
![Docker Image Version (tag latest semver)](https://img.shields.io/docker/v/frooodle/s-pdf/latest?link=https://github.com/Frooodle/Stirling-PDF/)
![GitHub Repo stars](https://img.shields.io/github/stars/frooodle/stirling-pdf?style=social)
![Paypal Donate](https://img.shields.io/badge/Paypal%20Donate-yellow?style=flat&logo=paypal&link=https://www.paypal.com/paypalme/froodleplex)
## Features

- Split PDFs into multiple files at specified page numbers or extract all pages as individual files.
- Merge multiple PDFs together into a single resultant file
- Convert PDFs to and from images
- Reorganize PDF pages into different orders.
- Add images to PDFs at specified locations. (WIP)
- Rotating PDFs in 90 degree increments.
- Compressing PDFs to decrease their filesize.
- Add and remove passwords
- Set PDF Permissions
- Add watermark(s)
- Edit metadata
- Dark mode support.

## Technologies used
- Spring Boot + Thymeleaf
- PDFBox
- e-iceblue spire.pdf.free (for PDF compression untill i find a nicer way)
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

## How to View
1. Open a web browser and navigate to `http://localhost:8080/`
2. Use the application by following the instructions on the website.

## Note
The application is currently not thread-safe
