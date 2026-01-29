package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import io.github.pixee.security.ZipSecurity;

import stirling.software.common.model.api.converters.HTMLToPdfRequest;

public class FileToPdf {

    public static byte[] convertHtmlToPdf(
            String weasyprintPath,
            HTMLToPdfRequest request,
            byte[] fileBytes,
            String fileName,
            TempFileManager tempFileManager,
            CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException, InterruptedException {

        try (TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf")) {
            Path tempHtmlFilePath;
            TempFile tempHtmlFile = null;
            TempDirectory tempExtractDir = null;

            try {
                if (fileName.toLowerCase(Locale.ROOT).endsWith(".html")) {
                    tempHtmlFile = new TempFile(tempFileManager, ".html");
                    String sanitizedHtml =
                            sanitizeHtmlContent(
                                    new String(fileBytes, StandardCharsets.UTF_8),
                                    customHtmlSanitizer);
                    tempHtmlFilePath = tempHtmlFile.getPath();
                    Files.write(tempHtmlFilePath, sanitizedHtml.getBytes(StandardCharsets.UTF_8));
                } else if (fileName.toLowerCase(Locale.ROOT).endsWith(".zip")) {
                    tempExtractDir = new TempDirectory(tempFileManager);
                    tempHtmlFilePath =
                            extractZipAndFindHtml(
                                    fileBytes, tempExtractDir.getPath(), customHtmlSanitizer);
                } else {
                    throw ExceptionUtils.createHtmlFileRequiredException();
                }

                List<String> command = new ArrayList<>();
                command.add(weasyprintPath);
                command.add("-e");
                command.add("utf-8");
                command.add("-v");
                command.add("--pdf-forms");
                command.add(tempHtmlFilePath.toAbsolutePath().toString());
                command.add(tempOutputFile.getAbsolutePath());

                ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                        .runCommandWithOutputHandling(command);

                byte[] pdfBytes = Files.readAllBytes(tempOutputFile.getPath());
                if (pdfBytes.length < 1) {
                    throw new IOException("Weasyprint produced empty PDF output");
                }
                return pdfBytes;
            } finally {
                if (tempHtmlFile != null) {
                    tempHtmlFile.close();
                }
                if (tempExtractDir != null) {
                    tempExtractDir.close();
                }
            }
        } // tempOutputFile auto-closed
    }

    private static Path extractZipAndFindHtml(
            byte[] zipBytes, Path extractDir, CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {
        List<Path> htmlFiles = new ArrayList<>();

        try (ZipInputStream zipIn =
                ZipSecurity.createHardenedInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry = zipIn.getNextEntry();
            while (entry != null) {
                Path filePath = extractDir.resolve(sanitizeZipFilename(entry.getName()));
                if (!entry.isDirectory()) {
                    Files.createDirectories(filePath.getParent());
                    String entryNameLower = entry.getName().toLowerCase(Locale.ROOT);
                    if (entryNameLower.endsWith(".html") || entryNameLower.endsWith(".htm")) {
                        String content = new String(zipIn.readAllBytes(), StandardCharsets.UTF_8);
                        String sanitizedContent = sanitizeHtmlContent(content, customHtmlSanitizer);
                        Files.write(filePath, sanitizedContent.getBytes(StandardCharsets.UTF_8));
                        htmlFiles.add(filePath);
                    } else {
                        Files.copy(zipIn, filePath);
                    }
                }
                zipIn.closeEntry();
                entry = zipIn.getNextEntry();
            }
        }

        if (htmlFiles.isEmpty()) {
            throw new IOException("No HTML file found in the ZIP archive");
        }

        // Prefer index.html if it exists, otherwise use the first HTML file found
        for (Path htmlFile : htmlFiles) {
            String name = htmlFile.getFileName().toString().toLowerCase(Locale.ROOT);
            if (name.equals("index.html") || name.equals("index.htm")) {
                return htmlFile;
            }
        }
        return htmlFiles.get(0);
    }

    private static String sanitizeHtmlContent(
            String htmlContent, CustomHtmlSanitizer customHtmlSanitizer) {
        return customHtmlSanitizer.sanitize(htmlContent);
    }

    static String sanitizeZipFilename(String entryName) {
        if (entryName == null || entryName.trim().isEmpty()) {
            return "";
        }
        // Remove any drive letters (e.g., "C:\") and leading forward/backslashes
        entryName =
                RegexPatternUtils.getInstance()
                        .getDriveLetterPattern()
                        .matcher(entryName)
                        .replaceAll("");
        entryName =
                RegexPatternUtils.getInstance()
                        .getLeadingSlashesPattern()
                        .matcher(entryName)
                        .replaceAll("");

        // Recursively remove path traversal sequences
        while (entryName.contains("../") || entryName.contains("..\\")) {
            entryName = entryName.replace("../", "").replace("..\\", "");
        }
        // Normalize all backslashes to forward slashes
        entryName =
                RegexPatternUtils.getInstance()
                        .getBackslashPattern()
                        .matcher(entryName)
                        .replaceAll("/");
        return entryName;
    }
}
