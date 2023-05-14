
To run the application without Docker, you will need to manually install all dependencies and build the necessary components.

Note that some dependencies might not be available in the standard repositories of all Linux distributions, and may require additional steps to install.

The following guide assumes you have a basic understanding of using a command line interface in your operating system.

It should work on most Linux distributions and MacOS. For Windows, you might need to use Windows Subsystem for Linux (WSL) for certain steps.
The amount of dependencies is to actually reduce overall size, ie installing LibreOffice sub components rather than full LibreOffice package.

### Step 1: Prerequisites

Install the following software, if not already installed:

- Java 17 or later

- Gradle 7.0 or later (included within repo so not needed on server)

- Git

- Python 3 (with pip)

- Make

- GCC/G++

- Automake

- Autoconf

- libtool

- pkg-config

- zlib1g-dev

- libleptonica-dev

For Debian-based systems, you can use the following command:

```bash
sudo apt-get update
sudo apt-get install -y git  automake  autoconf  libtool  libleptonica-dev  pkg-config zlib1g-dev make g++ java-17-openjdk python3 python3-pip
```

### Step 2: Clone and Build jbig2enc (Only required for certain OCR functionality)

```bash
git clone https:github.com/agl/jbig2enc
cd jbig2enc
./autogen.sh
./configure
make
sudo make install
```

### Step 3: Install Additional Software
Next we need to install LibreOffice for conversions, ocrmypdf for OCR, and opencv for patern recognition functionality.

Install the following software:

- libreoffice-core

- libreoffice-common

- libreoffice-writer

- libreoffice-calc

- libreoffice-impress

- python3-uno

- unoconv

- pngquant

- unpaper

- ocrmypdf

- opencv-python-headless

For Debian-based systems, you can use the following command:

```bash
sudo apt-get install -y libreoffice-core libreoffice-common libreoffice-writer libreoffice-calc  libreoffice-impress python3-uno  unoconv  pngquant  unpaper  ocrmypdf
pip3 install opencv-python-headless
```

### Step 4: Clone and Build Stirling-PDF

```bash
git clone https://github.com/Frooodle/Stirling-PDF.git
cd Stirling-PDF
./gradlew build
```


### Step 5: Move jar to desired location

After the build process, a `.jar` file will be generated in the `build/libs` directory.
You can move this file to a desired location, for example, `/opt/Stirling-PDF/`.
You must also move the Script folder within the Stirling-PDF repo that you have downloaded to this directory.
This folder is required for the python scripts using OpenCV

### Step 6: Other files
#### OCR
If you plan to use the OCR (Optical Character Recognition) functionality, you might need to install language packs for Tesseract if running none english scanning.

##### Installing Language Packs

1. Download the desired language pack(s) by selecting the `.traineddata` file(s) for the language(s) you need.
2. Place the `.traineddata` files in the Tesseract tessdata directory: `/usr/share/tesseract-ocr/4.00/tessdata`
Please view  [OCRmyPDF install guide](https://ocrmypdf.readthedocs.io/en/latest/installation.html) for more info.
**IMPORTANT:** DO NOT REMOVE EXISTING `eng.traineddata`, IT'S REQUIRED.



### Step 7: Run Stirling-PDF

```bash
./gradlew bootRun
or
java -jar build/libs/app.jar
```

### Step 8: Adding a Desktop icon

This will add a modified Appstarter to your Appmenu.
```bash
location=$(pwd)/gradlew
image=$(pwd)/docs/stirling-transparent.svg

cat > ~/.local/share/applications/Stirling-PDF.desktop <<EOF
[Desktop Entry]
Name=Stirling PDF;
GenericName=Launch StirlingPDF and open its WebGUI;
Category=Office;
Exec=xdg-open http://localhost:8080 && nohup $location bootRun &;
Icon=$image;
Keywords=pdf;
Type=Application;
NoDisplay=false;
Terminal=true;
EOF
```

Note: Currently the app will run in the background until manually closed.

---

Remember to set the necessary environment variables before running the project if you want to customize the application the list can be seen in the main readme.

You can do this in the terminal by using the `export` command or -D arguements to java -jar command:

```bash
export APP_HOME_NAME="Stirling PDF"
or
-DAPP_HOME_NAME="Stirling PDF" 
```

