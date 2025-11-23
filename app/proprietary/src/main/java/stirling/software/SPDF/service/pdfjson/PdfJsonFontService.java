package stirling.software.SPDF.service.pdfjson;

import java.io.IOException;
import java.nio.file.Files;
import java.util.Base64;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfJsonFontService {

    private final TempFileManager tempFileManager;

    @Getter
    @Value("${stirling.pdf.json.cff-converter.enabled:true}")
    private boolean cffConversionEnabled;

    @Getter
    @Value("${stirling.pdf.json.cff-converter.method:python}")
    private String cffConverterMethod;

    @Value("${stirling.pdf.json.cff-converter.python-command:/opt/venv/bin/python3}")
    private String pythonCommand;

    @Value("${stirling.pdf.json.cff-converter.python-script:/scripts/convert_cff_to_ttf.py}")
    private String pythonScript;

    @Value("${stirling.pdf.json.cff-converter.fontforge-command:fontforge}")
    private String fontforgeCommand;

    private volatile boolean pythonCffConverterAvailable;
    private volatile boolean fontForgeCffConverterAvailable;

    @PostConstruct
    private void initialiseCffConverterAvailability() {
        if (!cffConversionEnabled) {
            log.warn("[FONT-DEBUG] CFF conversion is DISABLED in configuration");
            pythonCffConverterAvailable = false;
            fontForgeCffConverterAvailable = false;
            return;
        }

        log.info("[FONT-DEBUG] CFF conversion enabled, checking tool availability...");
        pythonCffConverterAvailable = isCommandAvailable(pythonCommand);
        if (!pythonCffConverterAvailable) {
            log.warn(
                    "[FONT-DEBUG] Python command '{}' not found; Python CFF conversion disabled",
                    pythonCommand);
        } else {
            log.info("[FONT-DEBUG] Python command '{}' is available", pythonCommand);
        }

        fontForgeCffConverterAvailable = isCommandAvailable(fontforgeCommand);
        if (!fontForgeCffConverterAvailable) {
            log.warn(
                    "[FONT-DEBUG] FontForge command '{}' not found; FontForge CFF conversion disabled",
                    fontforgeCommand);
        } else {
            log.info("[FONT-DEBUG] FontForge command '{}' is available", fontforgeCommand);
        }

        log.info("[FONT-DEBUG] Selected CFF converter method: {}", cffConverterMethod);
    }

    public byte[] convertCffProgramToTrueType(byte[] fontBytes, String toUnicode) {
        if (!cffConversionEnabled || fontBytes == null || fontBytes.length == 0) {
            log.warn(
                    "[FONT-DEBUG] CFF conversion skipped: enabled={}, bytes={}",
                    cffConversionEnabled,
                    fontBytes == null ? "null" : fontBytes.length);
            return null;
        }

        log.info(
                "[FONT-DEBUG] Converting CFF font: {} bytes, method: {}",
                fontBytes.length,
                cffConverterMethod);

        if ("python".equalsIgnoreCase(cffConverterMethod)) {
            if (!pythonCffConverterAvailable) {
                log.debug("[FONT-DEBUG] Python CFF converter not available, skipping conversion");
                return null;
            }
            byte[] result = convertCffUsingPython(fontBytes, toUnicode);
            log.debug(
                    "[FONT-DEBUG] Python conversion result: {}",
                    result == null ? "null" : result.length + " bytes");
            return result;
        } else if ("fontforge".equalsIgnoreCase(cffConverterMethod)) {
            if (!fontForgeCffConverterAvailable) {
                log.debug(
                        "[FONT-DEBUG] FontForge CFF converter not available, skipping conversion");
                return null;
            }
            byte[] result = convertCffUsingFontForge(fontBytes);
            log.debug(
                    "[FONT-DEBUG] FontForge conversion result: {}",
                    result == null ? "null" : result.length + " bytes");
            return result;
        } else {
            log.debug(
                    "[FONT-DEBUG] Unknown CFF converter method: {}, falling back to Python",
                    cffConverterMethod);
            if (!pythonCffConverterAvailable) {
                log.debug("[FONT-DEBUG] Python CFF converter not available, skipping conversion");
                return null;
            }
            byte[] result = convertCffUsingPython(fontBytes, toUnicode);
            log.debug(
                    "[FONT-DEBUG] Python conversion result: {}",
                    result == null ? "null" : result.length + " bytes");
            return result;
        }
    }

    public String detectFontFlavor(byte[] fontBytes) {
        if (fontBytes == null || fontBytes.length < 4) {
            return null;
        }
        int signature =
                ((fontBytes[0] & 0xFF) << 24)
                        | ((fontBytes[1] & 0xFF) << 16)
                        | ((fontBytes[2] & 0xFF) << 8)
                        | (fontBytes[3] & 0xFF);
        if (signature == 0x00010000 || signature == 0x74727565) {
            return "ttf";
        }
        if (signature == 0x4F54544F) {
            return "otf";
        }
        if (signature == 0x74746366) {
            return "cff";
        }
        return null;
    }

    public String detectTrueTypeFormat(byte[] data) {
        if (data == null || data.length < 4) {
            return null;
        }
        int signature =
                ((data[0] & 0xFF) << 24)
                        | ((data[1] & 0xFF) << 16)
                        | ((data[2] & 0xFF) << 8)
                        | (data[3] & 0xFF);
        if (signature == 0x00010000) {
            return "ttf";
        }
        if (signature == 0x4F54544F) {
            return "otf";
        }
        if (signature == 0x74746366) {
            return "cff";
        }
        return null;
    }

    public String validateFontTables(byte[] fontBytes) {
        if (fontBytes == null || fontBytes.length < 12) {
            return "Font program too small";
        }
        int numTables = ((fontBytes[4] & 0xFF) << 8) | (fontBytes[5] & 0xFF);
        if (numTables <= 0 || numTables > 512) {
            return "Invalid numTables: " + numTables;
        }
        return null;
    }

    private byte[] convertCffUsingPython(byte[] fontBytes, String toUnicode) {
        if (!pythonCffConverterAvailable) {
            log.debug("[FONT-DEBUG] Python CFF converter not available");
            return null;
        }
        if (pythonCommand == null
                || pythonCommand.isBlank()
                || pythonScript == null
                || pythonScript.isBlank()) {
            log.debug("[FONT-DEBUG] Python converter not configured");
            return null;
        }

        log.debug(
                "[FONT-DEBUG] Running Python CFF converter: command={}, script={}",
                pythonCommand,
                pythonScript);

        try (TempFile inputFile = new TempFile(tempFileManager, ".cff");
                TempFile outputFile = new TempFile(tempFileManager, ".otf");
                TempFile toUnicodeFile =
                        toUnicode != null ? new TempFile(tempFileManager, ".tounicode") : null) {
            Files.write(inputFile.getPath(), fontBytes);
            if (toUnicodeFile != null) {
                try {
                    byte[] toUnicodeBytes = Base64.getDecoder().decode(toUnicode);
                    Files.write(toUnicodeFile.getPath(), toUnicodeBytes);
                } catch (IllegalArgumentException ex) {
                    log.debug(
                            "[FONT-DEBUG] Failed to decode ToUnicode data for CFF conversion: {}",
                            ex.getMessage());
                    return null;
                }
            }

            String[] command =
                    buildPythonCommand(
                            inputFile.getAbsolutePath(),
                            outputFile.getAbsolutePath(),
                            toUnicodeFile != null ? toUnicodeFile.getAbsolutePath() : null);
            log.debug("[FONT-DEBUG] Executing: {}", String.join(" ", command));

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.CFF_CONVERTER)
                            .runCommandWithOutputHandling(java.util.Arrays.asList(command));

            if (result.getRc() != 0) {
                log.error(
                        "[FONT-DEBUG] Python CFF conversion failed with exit code: {}",
                        result.getRc());
                log.error("[FONT-DEBUG] Stdout: {}", result.getMessages());
                return null;
            }
            if (!Files.exists(outputFile.getPath())) {
                log.error("[FONT-DEBUG] Python CFF conversion produced no output file");
                return null;
            }
            byte[] data = Files.readAllBytes(outputFile.getPath());
            if (data.length == 0) {
                log.error("[FONT-DEBUG] Python CFF conversion returned empty output");
                return null;
            }
            log.info(
                    "[FONT-DEBUG] Python CFF conversion succeeded: {} bytes -> {} bytes",
                    fontBytes.length,
                    data.length);
            return data;
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("[FONT-DEBUG] Python CFF conversion exception: {}", ex.getMessage(), ex);
            return null;
        }
    }

    public byte[] convertCffUsingFontForge(byte[] fontBytes) {
        if (!fontForgeCffConverterAvailable) {
            log.debug("FontForge CFF converter not available");
            return null;
        }

        try (TempFile inputFile = new TempFile(tempFileManager, ".cff");
                TempFile outputFile = new TempFile(tempFileManager, ".ttf")) {
            Files.write(inputFile.getPath(), fontBytes);

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.CFF_CONVERTER)
                            .runCommandWithOutputHandling(
                                    java.util.Arrays.asList(
                                            fontforgeCommand,
                                            "-lang=ff",
                                            "-c",
                                            "Open($1); "
                                                    + "ScaleToEm(1000); "
                                                    + "SelectWorthOutputting(); "
                                                    + "SetFontOrder(2); "
                                                    + "Reencode(\"unicode\"); "
                                                    + "RoundToInt(); "
                                                    + "RemoveOverlap(); "
                                                    + "Simplify(); "
                                                    + "CorrectDirection(); "
                                                    + "Generate($2, \"\", 4+16+32); "
                                                    + "Close(); "
                                                    + "Quit()",
                                            inputFile.getAbsolutePath(),
                                            outputFile.getAbsolutePath()));

            if (result.getRc() != 0) {
                log.warn("FontForge CFF conversion failed: {}", result.getRc());
                return null;
            }
            if (!Files.exists(outputFile.getPath())) {
                log.warn("FontForge CFF conversion produced no output");
                return null;
            }
            byte[] data = Files.readAllBytes(outputFile.getPath());
            if (data.length == 0) {
                log.warn("FontForge CFF conversion returned empty output");
                return null;
            }
            return data;
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("FontForge CFF conversion failed: {}", ex.getMessage());
            return null;
        }
    }

    private boolean isCommandAvailable(String command) {
        if (command == null || command.isBlank()) {
            return false;
        }
        try {
            ProcessBuilder processBuilder = new ProcessBuilder();
            if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows")) {
                processBuilder.command("where", command);
            } else {
                processBuilder.command("which", command);
            }
            Process process = processBuilder.start();
            int exitCode = process.waitFor();
            return exitCode == 0;
        } catch (Exception e) {
            log.debug("Error checking for command {}: {}", command, e.getMessage());
            return false;
        }
    }

    private String[] buildPythonCommand(String input, String output, String toUnicode) {
        if (toUnicode != null) {
            return new String[] {
                pythonCommand,
                pythonScript,
                "--input",
                input,
                "--output",
                output,
                "--to-unicode",
                toUnicode
            };
        }
        return new String[] {pythonCommand, pythonScript, "--input", input, "--output", output};
    }
}
