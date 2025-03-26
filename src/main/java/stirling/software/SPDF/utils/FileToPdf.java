package stirling.software.SPDF.utils;

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

import stirling.software.SPDF.model.api.converters.HTMLToPdfRequest;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

public class FileToPdf {

    public static byte[] convertHtmlToPdf(
            String weasyprintPath,
            HTMLToPdfRequest request,
            byte[] fileBytes,
            String fileName,
            boolean disableSanitize)
            throws IOException, InterruptedException {

        Path tempOutputFile = Files.createTempFile("output_", ".pdf");
        Path tempInputFile = null;
        byte[] pdfBytes;
        try {
            if (fileName.endsWith(".html")) {
                tempInputFile = Files.createTempFile("input_", ".html");
                String sanitizedHtml =
                        sanitizeHtmlContent(
                                new String(fileBytes, StandardCharsets.UTF_8), disableSanitize);
                Files.write(tempInputFile, sanitizedHtml.getBytes(StandardCharsets.UTF_8));
            } else if (fileName.endsWith(".zip")) {
                tempInputFile = Files.createTempFile("input_", ".zip");
                Files.write(tempInputFile, fileBytes);
                sanitizeHtmlFilesInZip(tempInputFile, disableSanitize);
            } else {
                throw new IllegalArgumentException("Unsupported file format: " + fileName);
            }

            List<String> command = new ArrayList<>();
            command.add(weasyprintPath);
            command.add("-e");
            command.add("utf-8");
            command.add("-v");
            command.add("--pdf-forms");
            command.add(tempInputFile.toString());
            command.add(tempOutputFile.toString());

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                            .runCommandWithOutputHandling(command);

            pdfBytes = Files.readAllBytes(tempOutputFile);
        } catch (IOException e) {
            pdfBytes = Files.readAllBytes(tempOutputFile);
            if (pdfBytes.length < 1) {
                throw e;
            }
        } finally {
            Files.deleteIfExists(tempOutputFile);
            Files.deleteIfExists(tempInputFile);
        }

        return pdfBytes;
    }

    private static String sanitizeHtmlContent(String htmlContent, boolean disableSanitize) {
        return (!disableSanitize) ? CustomHtmlSanitizer.sanitize(htmlContent) : htmlContent;
    }

    private static void sanitizeHtmlFilesInZip(Path zipFilePath, boolean disableSanitize)
            throws IOException {
        Path tempUnzippedDir = Files.createTempDirectory("unzipped_");
        try (ZipInputStream zipIn =
                ZipSecurity.createHardenedInputStream(
                        new ByteArrayInputStream(Files.readAllBytes(zipFilePath)))) {
            ZipEntry entry = zipIn.getNextEntry();
            while (entry != null) {
                Path filePath = tempUnzippedDir.resolve(sanitizeZipFilename(entry.getName()));
                if (!entry.isDirectory()) {
                    Files.createDirectories(filePath.getParent());
                    if (entry.getName().toLowerCase().endsWith(".html")
                            || entry.getName().toLowerCase().endsWith(".htm")) {
                        String content = new String(zipIn.readAllBytes(), StandardCharsets.UTF_8);
                        String sanitizedContent = sanitizeHtmlContent(content, disableSanitize);
                        Files.write(filePath, sanitizedContent.getBytes(StandardCharsets.UTF_8));
                    } else {
                        Files.copy(zipIn, filePath);
                    }
                }
                zipIn.closeEntry();
                entry = zipIn.getNextEntry();
            }
        }

        // Repack the sanitized files
        zipDirectory(tempUnzippedDir, zipFilePath);

        // Clean up
        deleteDirectory(tempUnzippedDir);
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
