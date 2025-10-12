# RAR Support Setup for PDF to CBR Conversion in Stirling-PDF

## Overview

Stirling-PDF can convert PDF files to the CBR (Comic Book RAR) format. To enable this functionality, the `rar` command-line utility must be installed and accessible. This guide covers the setup for both Docker and non-Docker environments.


## What is a CBR file?

CBR (Comic Book RAR) is an archive format used for digital comic books. It uses RAR compression to package sequential image files (like JPEG or PNG) into a single file. While the CBZ (Comic Book ZIP) format is more common and uses the open ZIP standard, CBR requires the proprietary `rar` utility for creation.

-----

## Quick Start (Docker)

This is the fastest way to get RAR working with a Stirling-PDF Docker container.

1.  **Download RAR Command-Line Tools**

    * Go to the official RARLAB downloads page: [rarlab.com/download.htm](https://www.rarlab.com/download.htm)
    * Download the "RAR for Linux", "RAR for macOS", or "RAR for Windows" command-line version that matches your **host machine's architecture** (e.g., x64, ARM64).

2.  **Install RAR on Your Host Machine**
    Make the `rar` binary available system-wide. For Linux or macOS:

    ```bash
    # (Example for Linux x64)
    # Extract the downloaded archive
    tar -xzf rarlinux-x64-*.tar.gz

    # Move the 'rar' binary to a standard location
    sudo mv rar/rar /usr/local/bin/rar

    # Make it executable
    sudo chmod +x /usr/local/bin/rar
    ```

3.  **Mount the RAR Binary into Your Docker Container**
    Add a single line to the `volumes` section of your `docker-compose.yml` file. This makes the `rar` binary on your host machine available inside the container.

    ```yaml
    services:
      stirling-pdf:
        image: ghcr.io/stirling-tools/stirling-pdf:latest
        ports:
          - '8080:8080'
        volumes:
          - ./StirlingPDF/trainingData:/usr/share/tessdata # Required for extra OCR languages
          - ./StirlingPDF/extraConfigs:/configs
          - ./StirlingPDF/customFiles:/customFiles/
          - ./StirlingPDF/logs:/logs/
          - ./StirlingPDF/pipeline:/pipeline/
          # ADD THE FOLLOWING LINE:
          - /usr/local/bin/rar:/usr/local/bin/rar:ro
    ```

-----

## Detailed Setup Instructions

### Docker Setup

#### Step 1: Download and Install RAR on the Host System

1.  **Download the RAR utility:**

    * Visit the official download page: [rarlab.com/download.htm](https://www.rarlab.com/download.htm).
    * Download the correct command-line version for your host system's OS and CPU architecture (e.g., `rarlinux-x64-*.tar.gz` for 64-bit Linux).

2.  **Install RAR on your host system:**

    **For Linux:**

    ```bash
    # Extract the downloaded archive
    tar -xzf rarlinux-x64-*.tar.gz

    # Move the binary to a directory in your system's PATH
    sudo mv rar/rar /usr/local/bin/rar

    # Grant execute permissions
    sudo chmod +x /usr/local/bin/rar
    ```

    **For Windows:**

    * Download and extract the command-line tools archive.
    * Copy `rar.exe` to a directory that is in your system's PATH (e.g., `C:\Windows\System32`).
    * In Docker Desktop settings, ensure the drive containing `rar.exe` is shared with your Docker engine.
    * Adjust the volume mount path in your Docker command to reflect the Windows path (e.g., `C:/path/to/rar.exe:/usr/local/bin/rar:ro`).

    **For macOS:**

    ```bash
    # Extract the downloaded archive
    tar -xzf rarmacos-*.tar.gz

    # Move the binary to a directory in your system's PATH
    sudo mv rar/rar /usr/local/bin/rar

    # Grant execute permissions
    sudo chmod +x /usr/local/bin/rar
    ```

#### Step 2: Mount the RAR Binary into the Docker Container

Update your Docker command to include the volume mount. This exposes the `rar` executable from your host to the container in read-only (`:ro`) mode.

**Using `docker-compose.yml`:**

```yaml
services:
    stirling-pdf:
        image: ghcr.io/stirling-tools/stirling-pdf:latest
        container_name: stirling-pdf
        ports:
            - "8080:8080"
        volumes:
            # Your existing volumes...
            - ./extraConfigs:/configs
            - ./logs:/logs

            # Add the RAR binary mount
            - /usr/local/bin/rar:/usr/local/bin/rar:ro
        restart: unless-stopped
```

### Non-Docker Setup

If you are running Stirling-PDF directly on your OS, simply install the `rar` utility and ensure it is available in your system's PATH.

**Linux (Debian/Ubuntu):**

* The `rar` package is typically in the `non-free` repository. Ensure it is enabled.

<!-- end list -->

```bash
sudo apt update
sudo apt install rar
```

**Linux (Fedora/CentOS/RHEL):**

* The `rar` package is available from the RPM Fusion "non-free" repository.

<!-- end list -->

```bash
# First, enable the RPM Fusion non-free repository for your system
# (See https://rpmfusion.org/Configuration)

# Then, install rar
sudo dnf install rar     # Fedora, RHEL 8+, CentOS Stream
# or
sudo yum install rar     # CentOS 7
```

**Windows:**

1.  Download the command-line tools from [rarlab.com/download.htm](https://www.rarlab.com/download.htm).
2.  Extract the archive and copy `rar.exe` to a folder included in your system's PATH environment variable (e.g., `C:\Windows\System32`).
3.  Restart the Stirling-PDF application to ensure it recognizes the new PATH.

**macOS:**

* The easiest method is to use Homebrew.

<!-- end list -->

```bash
brew install rar
```

-----

## Verification

After setup, confirm that Stirling-PDF can access the `rar` command.

- **For Docker users, check if `rar` is accessible in the container:**

    ```bash
    docker exec stirling-pdf rar
    ```

- **For non-Docker users, check if `rar` is accessible from the command line:**
    ```bash
  which rar
    ```
or your operating system's equivalent.
## License Note

Please be aware that RAR is shareware. It is free to use for personal, non-commercial purposes, but business or commercial use may require purchasing a license. Review the official RAR license terms on the RARLAB website for details.

## Alternative: Use CBZ Format

If you encounter issues or prefer not to use proprietary software, consider converting your files to the **CBZ (Comic Book ZIP)** format instead.

* CBZ uses the open ZIP standard and requires no extra software installation.
* The **PDF to CBZ** tool is available in Stirling-PDF by default.
* CBZ is widely supported by virtually all modern comic book reader applications, which is not the case for RAR.
