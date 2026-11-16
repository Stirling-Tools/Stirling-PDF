# OCR Language Packs and Setup

This document provides instructions on how to add additional language packs for the OCR tab in Stirling-PDF, both inside and outside of Docker.

## My OCR used to work and now doesn't!

The paths have changed for the tessdata locations on new Docker images. Please use `/usr/share/tessdata` (Others should still work for backward compatibility but might not).

## How does the OCR Work

Stirling-PDF uses Tesseract for its text recognition. All credit goes to them for this awesome work!

## Language Packs

Tesseract OCR supports a variety of languages. You can find additional language packs in the Tesseract GitHub repositories:

- [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast): These language packs are smaller and faster to load but may provide lower recognition accuracy.
- [tessdata](https://github.com/tesseract-ocr/tessdata): These language packs are larger and provide better recognition accuracy, but may take longer to load.

Depending on your requirements, you can choose the appropriate language pack for your use case. By default, Stirling-PDF uses `tessdata_fast` for English, but this can be replaced.

### Installing Language Packs

1. Download the desired language pack(s) by selecting the `.traineddata` file(s) for the language(s) you need.
2. Place the `.traineddata` files in the Tesseract tessdata directory: `/usr/share/tessdata`

**DO NOT REMOVE EXISTING `eng.traineddata`, IT'S REQUIRED.**

### Docker Setup

If you are using Docker, you need to expose the Tesseract tessdata directory as a volume in order to use the additional language packs.

#### Docker Compose

Modify your `docker-compose.yml` file to include the following volume configuration:

```yaml
services:
  your_service_name:
    image: your_docker_image_name
    volumes:
      - /location/of/trainingData:/usr/share/tessdata
```

#### Docker Run

Add the following to your existing Docker run command:

```bash
-v /location/of/trainingData:/usr/share/tessdata
```

### Non-Docker Setup

For Debian-based systems, install languages with this command:

```bash
sudo apt update &&\
# All languages
# sudo apt install -y 'tesseract-ocr-*'

# Find languages:
apt search tesseract-ocr-

# View installed languages:
dpkg-query -W tesseract-ocr- | sed 's/tesseract-ocr-//g'
```

For Fedora:

```bash
# All languages
# sudo dnf install -y tesseract-langpack-*

# Find languages:
dnf search -C tesseract-langpack-

# View installed languages:
rpm -qa | grep tesseract-langpack | sed 's/tesseract-langpack-//g'
```

For Windows:

You must ensure tesseract is installed

Additional languages must be downloaded manually:
Download desired .traineddata files from tessdata or tessdata_fast
Place them in the tessdata folder within your Tesseract installation directory
(e.g., C:\Program Files\Tesseract-OCR\tessdata)

Verify installation:
``tesseract --list-langs``

You must then edit your ``/configs/settings.yml`` and change the system.tessdataDir to match the directory containing lang files

```
system:
 tessdataDir: C:/Program Files/Tesseract-OCR/tessdata # path to the directory containing the Tessdata files. This setting is relevant for Windows systems. For Windows users, this path should be adjusted to point to the appropriate directory where the Tessdata files are stored.
```
  