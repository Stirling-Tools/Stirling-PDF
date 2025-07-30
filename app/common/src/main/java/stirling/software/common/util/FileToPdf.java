package stirling.software.common.util;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import io.github.pixee.security.ZipSecurity;

import stirling.software.common.model.api.converters.HTMLToPdfRequest;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

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
            try (TempFile tempInputFile =
                    new TempFile(
                            tempFileManager,
                            fileName.toLowerCase().endsWith(".html") ? ".html" : ".zip")) {

                if (fileName.toLowerCase().endsWith(".html")) {
                    String sanitizedHtml =
                            sanitizeHtmlContent(
                                    new String(fileBytes, StandardCharsets.UTF_8),
                                    customHtmlSanitizer);
                    Files.write(
                            tempInputFile.getPath(),
                            sanitizedHtml.getBytes(StandardCharsets.UTF_8));
                } else if (fileName.toLowerCase().endsWith(".zip")) {
                    Files.write(tempInputFile.getPath(), fileBytes);
                    sanitizeHtmlFilesInZip(
                            tempInputFile.getPath(), tempFileManager, customHtmlSanitizer);
                } else {
                    throw ExceptionUtils.createHtmlFileRequiredException();
                }

                List<String> command = new ArrayList<>();
                command.add(weasyprintPath);
                command.add("-e");
                command.add("utf-8");
                command.add("-v");
                command.add("--pdf-forms");
                command.add(tempInputFile.getAbsolutePath());
                command.add(tempOutputFile.getAbsolutePath());

                ProcessExecutorResult returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                                .runCommandWithOutputHandling(command);

                byte[] pdfBytes = Files.readAllBytes(tempOutputFile.getPath());
                try {
                    return pdfBytes;
                } catch (Exception e) {
                    pdfBytes = Files.readAllBytes(tempOutputFile.getPath());
                    if (pdfBytes.length < 1) {
                        throw e;
                    }
                    return pdfBytes;
                }
            } // tempInputFile auto-closed
        } // tempOutputFile auto-closed
    }

    private static String sanitizeHtmlContent(
            String htmlContent, CustomHtmlSanitizer customHtmlSanitizer) {
        return customHtmlSanitizer.sanitize(htmlContent);
    }

    private static void sanitizeHtmlFilesInZip(
            Path zipFilePath,
            TempFileManager tempFileManager,
            CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {
        try (TempDirectory tempUnzippedDir = new TempDirectory(tempFileManager)) {
            try (ZipInputStream zipIn =
                    ZipSecurity.createHardenedInputStream(
                            new ByteArrayInputStream(Files.readAllBytes(zipFilePath)))) {
                ZipEntry entry = zipIn.getNextEntry();
                while (entry != null) {
                    Path filePath =
                            tempUnzippedDir.getPath().resolve(sanitizeZipFilename(entry.getName()));
                    if (!entry.isDirectory()) {
                        Files.createDirectories(filePath.getParent());
                        if (entry.getName().toLowerCase().endsWith(".html")
                                || entry.getName().toLowerCase().endsWith(".htm")) {
                            String content =
                                    new String(zipIn.readAllBytes(), StandardCharsets.UTF_8);
                            String sanitizedContent =
                                    sanitizeHtmlContent(content, customHtmlSanitizer);
                            Files.write(
                                    filePath, sanitizedContent.getBytes(StandardCharsets.UTF_8));
                        } else {
                            Files.copy(zipIn, filePath);
                        }
                    }
                    zipIn.closeEntry();
                    entry = zipIn.getNextEntry();
                }
            }

            // Repack the sanitized files
            zipDirectory(tempUnzippedDir.getPath(), zipFilePath);
        } // tempUnzippedDir auto-cleaned
    }

    private static void zipDirectory(Path sourceDir, Path zipFilePath) throws IOException {
        try (ZipOutputStream zos =
                new ZipOutputStream(new FileOutputStream(zipFilePath.toFile()))) {
            Files.walk(sourceDir)
                    .filter(path -> !Files.isDirectory(path))
                    .forEach(
                            path -> {
                                ZipEntry zipEntry =
                                        new ZipEntry(sourceDir.relativize(path).toString());
                                try {
                                    zos.putNextEntry(zipEntry);
                                    Files.copy(path, zos);
                                    zos.closeEntry();
                                } catch (IOException e) {
                                    throw new UncheckedIOException(e);
                                }
                            });
        }
    }

    private static void deleteDirectory(Path dir) throws IOException {
        Files.walkFileTree(
                dir,
                new SimpleFileVisitor<Path>() {
                    @Override
                    public FileVisitResult visitFile(Path file, BasicFileAttributes attrs)
                            throws IOException {
                        Files.delete(file);
                        return FileVisitResult.CONTINUE;
                    }

                    @Override
                    public FileVisitResult postVisitDirectory(Path dir, IOException exc)
                            throws IOException {
                        Files.delete(dir);
                        return FileVisitResult.CONTINUE;
                    }
                });
    }

    private static Path unzipAndGetMainHtml(byte[] fileBytes) throws IOException {
        Path tempDirectory = Files.createTempDirectory("unzipped_");
        try (ZipInputStream zipIn =
                ZipSecurity.createHardenedInputStream(new ByteArrayInputStream(fileBytes))) {
            ZipEntry entry = zipIn.getNextEntry();
            while (entry != null) {
                Path filePath = tempDirectory.resolve(sanitizeZipFilename(entry.getName()));
                if (entry.isDirectory()) {
                    Files.createDirectories(filePath); // Explicitly create the directory structure
                } else {
                    Files.createDirectories(
                            filePath.getParent()); // Create parent directories if they don't exist
                    Files.copy(zipIn, filePath);
                }
                zipIn.closeEntry();
                entry = zipIn.getNextEntry();
            }
        }

        // Search for the main HTML file.
        try (Stream<Path> walk = Files.walk(tempDirectory)) {
            List<Path> htmlFiles = walk.filter(file -> file.toString().endsWith(".html")).toList();

            if (htmlFiles.isEmpty()) {
                throw new IOException("No HTML files found in the unzipped directory.");
            }

            // Prioritize 'index.html' if it exists, otherwise use the first .html file
            for (Path htmlFile : htmlFiles) {
                if ("index.html".equals(htmlFile.getFileName().toString())) {
                    return htmlFile;
                }
            }

            return htmlFiles.get(0);
        }
    }

    static String sanitizeZipFilename(String entryName) {
        if (entryName == null || entryName.trim().isEmpty()) {
            return "";
        }
        // Remove any drive letters (e.g., "C:\") and leading forward/backslashes
        entryName = entryName.replaceAll("^[a-zA-Z]:[\\\\/]+", "");
        entryName = entryName.replaceAll("^[\\\\/]+", "");

        // Recursively remove path traversal sequences
        while (entryName.contains("../") || entryName.contains("..\\")) {
            entryName = entryName.replace("../", "").replace("..\\", "");
        }
        // Normalize all backslashes to forward slashes
        entryName = entryName.replaceAll("\\\\", "/");
        return entryName;
    }
}
