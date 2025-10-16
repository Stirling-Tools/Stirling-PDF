# Enabling PDF to CBR Conversion in Stirling-PDF

## Overview

Stirling-PDF can convert PDF files into the Comic Book RAR (`.cbr`) format. This process relies on an external command-line utility, `rar`, which is not included by default. To enable this feature, you must first install the `rar` utility on your system and then make it accessible to Stirling-PDF.

### What is a CBR file?

A CBR (Comic Book RAR) file is an archive used for distributing digital comic books. It is essentially a collection of sequential image files (e.g., JPEG, PNG) compressed into a single file using RAR compression.

While CBR is a popular format, it requires the proprietary `rar` utility for creation. Its more common, open-standard alternative is CBZ (Comic Book ZIP), which is supported by Stirling-PDF out of the box.

-----

## Step 1: Install the `rar` Command-Line Utility

This is a mandatory prerequisite for both Docker and non-Docker setups. The `rar` executable must be installed on the host machine.

### Linux

The easiest method is to use your distribution's package manager.

**Debian / Ubuntu:**
The `rar` package is available in the `non-free` repository.

```bash
sudo apt update
sudo apt install rar
```

**Fedora / CentOS / RHEL:**
The `rar` package is available in the RPM Fusion "non-free" repository.

```bash
# First, enable the RPM Fusion non-free repository for your system.
# See https://rpmfusion.org/Configuration for instructions.

# Then, install rar
sudo dnf install rar  # For Fedora, RHEL 8+, CentOS Stream
# or
sudo yum install rar  # For CentOS 7
```

**Manual Installation (Any Linux Distribution):**

1.  Visit the official download page: [rarlab.com/download.htm](https://www.rarlab.com/download.htm).
2.  Download the "RAR for Linux x64" command-line version.
3.  Extract the archive and install the binary:
    ```bash
    # The version number (e.g., 712, as of writing this guide) will change.
    # Use the actual filename.
    tar -xzf rarlinux-x64-*.tar.gz

    # Move the binary to a standard location in your system's PATH
    sudo mv rar/rar /usr/local/bin/

    # Ensure it has execute permissions
    sudo chmod +x /usr/local/bin/rar
    ```

### Windows

1.  Download the "WinRAR and RAR command line tools" from [rarlab.com/download.htm](https://www.rarlab.com/download.htm).
2.  Extract the downloaded archive.
3.  Copy the `rar.exe` file to a folder that is included in your system's `PATH` environment variable. A common and reliable location is `C:\Windows\System32`.
4.  If Stirling-PDF is already running, restart it to ensure it recognizes the updated `PATH`.

### macOS

The recommended method is to use the [Homebrew](https://brew.sh/) package manager.

```bash
brew install rar
```

-----

## Step 2: Configure Stirling-PDF

After installing `rar` on your host system, follow the appropriate instructions for your environment.

### For Non-Docker Users

If you installed Stirling-PDF directly on your operating system (without Docker), no further configuration is needed. As long as the `rar` command is available in your system's `PATH`, Stirling-PDF will automatically (after restart) detect and use it.

### For Docker Users

For the binary to be accessible inside the container, you have to mount the binary as a volume.

Update your `docker-compose.yml` to include the volume mount. The path on the host side must match where you installed `rar`.

```yaml
services:
  stirling-pdf:
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest
    ports:
      - '8080:8080'
    volumes:
      - ./StirlingPDF/trainingData:/usr/share/tessdata
      - ./StirlingPDF/extraConfigs:/configs
      - ./StirlingPDF/customFiles:/customFiles/
      - ./StirlingPDF/logs:/logs/
      - ./StirlingPDF/pipeline:/pipeline/
      # Add the following line to mount the rar binary
      - /usr/local/bin/rar:/usr/local/bin/rar:ro
```

**Note for Windows Docker Users:**
The host path must use forward slashes. For example, if you placed `rar.exe` in `C:\Program Files\RAR`, your volume mount would look like this:

```yaml
# Example for Windows host path
- "C:/Program Files/RAR/rar.exe:/usr/local/bin/rar:ro"
```

-----

## Step 3: Verification

Confirm that Stirling-PDF can access the `rar` command.

* **For Docker Users:** Execute a command inside the running container.

  ```bash
  docker exec -it stirling-pdf rar
  ```

* **For Non-Docker Users:** Check if the `rar` command is recognized in your terminal.

  ```bash
  # On Linux and macOS
  which rar

  # On Windows
  where rar
  ```

In both cases, a successful setup will display the RAR version and usage information. An error like "command not found" means there is a problem with the installation or `PATH`.

-----

## Important Considerations

### License Note

RAR is shareware. While it is free to use for personal, non-commercial purposes, business or commercial use may require purchasing a license. Please review the official RAR license terms on the RARLAB website for complete details.

### Alternative: Use the CBZ Format

For broader compatibility and to avoid proprietary software, using the **CBZ (Comic Book ZIP)** format is highly recommended.

* CBZ uses the open and universal ZIP standard.
* The **PDF to CBZ** tool is enabled in Stirling-PDF by default and requires no extra software.
* CBZ is supported by virtually all modern comic book reader applications.
