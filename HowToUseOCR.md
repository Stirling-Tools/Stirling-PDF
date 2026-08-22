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

**Keep the `configs/` directory too, if the one you are assembling has one.**
Stirling-PDF asks Tesseract for `pdf` output, and `pdf` is the name of a config
file read from `<tessdata>/configs` - not an output format. A tessdata directory
holding nothing but `.traineddata` files makes Tesseract exit successfully having
written no file at all, so OCR appears to run and produces nothing.

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

The desktop app installs its own Tesseract runtime on demand, so nothing has to
be installed separately and the installer does not carry ~130 MB for a feature
not everyone uses. Choose OCR and the languages you want during installation, or
turn it on later from the OCR tool or from Settings; more languages can be added
at any time and take effect immediately, without restarting.

What gets installed and from where is described by a manifest - a small JSON file
listing, per platform, the engine and every language model with its size and its
SHA-256. Nothing is downloaded that the manifest does not describe, and nothing
is kept whose SHA-256 does not match. The address of that manifest is a setting,
so an installation can be pointed at an internal mirror or a local copy:

```
system:
  ocr:
    manifestUrl: "" # empty uses the default; set it to use a mirror or work offline
```

The runtime lands next to the application's own data, so adding a language never
needs administrator rights.

The rest of this section applies when running the JAR directly, or when you want
to use a Tesseract you installed yourself. Point Stirling-PDF at it with:

```
system:
  customPaths:
    operations:
      tesseract: C:/Program Files/Tesseract-OCR/tesseract.exe
```

When left empty, Stirling-PDF uses the bundled Tesseract if there is one and
otherwise looks the command up on `PATH`, as it always did.

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
  