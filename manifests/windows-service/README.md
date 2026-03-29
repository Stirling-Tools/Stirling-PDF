# Windows Service — Stirling-PDF

Run Stirling-PDF as a persistent Windows service using
[WinSW](https://github.com/winsw/winsw).

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Windows 10 / Server 2019+ | |
| Java 17+ (JRE or JDK) | [Adoptium Temurin](https://adoptium.net) recommended |
| Administrator privileges | Required to install / manage services |

## Quick install (automated)

```powershell
# Open PowerShell as Administrator and run:
.\install-service.ps1 -JarPath "C:\path\to\Stirling-PDF-<version>.jar"
```

The script will:
1. Verify Java 17+ is available.
2. Download WinSW automatically (requires internet access).
3. Copy the JAR and service config into `C:\Program Files\Stirling-PDF\`.
4. Register and start the **StirlingPDF** service.

Once running, open <http://localhost:8080> in your browser.

## Manual install

1. Download the latest `WinSW-x64.exe` from
   <https://github.com/winsw/winsw/releases>.
2. Rename it to `stirling-pdf-service.exe`.
3. Place `stirling-pdf-service.exe`, `stirling-pdf-service.xml`, and
   `Stirling-PDF-<version>.jar` in the same folder (e.g.
   `C:\Program Files\Stirling-PDF\`).
4. Open a PowerShell prompt **as Administrator** in that folder:

```powershell
.\stirling-pdf-service.exe install
.\stirling-pdf-service.exe start
```

## Service management

| Action | Command |
|--------|---------|
| Start  | `sc start StirlingPDF` |
| Stop   | `sc stop StirlingPDF` |
| Status | `sc query StirlingPDF` |
| Logs   | `%ProgramFiles%\Stirling-PDF\logs\` |

Or use **Services** (`services.msc`) and look for **Stirling-PDF**.

## Configuration

Edit `C:\Program Files\Stirling-PDF\stirling-pdf-service.xml` to:

- Change the listening port: add `-Dserver.port=9090` to `<arguments>`.
- Adjust JVM heap: change the `JAVA_OPTS` env value.
- Change the data / log paths: modify `<workingdirectory>` and `<logpath>`.

After editing, reinstall:

```powershell
.\stirling-pdf-service.exe stop
.\stirling-pdf-service.exe uninstall
.\stirling-pdf-service.exe install
.\stirling-pdf-service.exe start
```

## Uninstall

```powershell
# As Administrator:
sc stop StirlingPDF
"C:\Program Files\Stirling-PDF\stirling-pdf-service.exe" uninstall
Remove-Item -Recurse "C:\Program Files\Stirling-PDF"
```
