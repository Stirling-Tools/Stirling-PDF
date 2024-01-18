package stirling.software.SPDF.utils;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

public class FileToPdf {

    public static byte[] convertHtmlToPdf(
            byte[] fileBytes, String fileName, boolean htmlFormatsInstalled)
            throws IOException, InterruptedException {

        Path tempOutputFile = Files.createTempFile("output_", ".pdf");
        Path tempInputFile = null;
        byte[] pdfBytes;
        try {
            if (fileName.endsWith(".html")) {
                tempInputFile = Files.createTempFile("input_", ".html");
                Files.write(tempInputFile, fileBytes);
            } else {
                tempInputFile = unzipAndGetMainHtml(fileBytes);
            }

            List<String> command = new ArrayList<>();
            if (!htmlFormatsInstalled) {
                command.add("weasyprint");
            } else {
                command.add("wkhtmltopdf");
                command.add("--enable-local-file-access");
                command.add("--load-error-handling");
                command.add("ignore");
                command.add("--load-media-error-handling");
                command.add("ignore");
            }

            command.add(tempInputFile.toString());
            command.add(tempOutputFile.toString());
            ProcessExecutorResult returnCode;
            if (fileName.endsWith(".zip")) {

                if (htmlFormatsInstalled) {
                    // command.add(1, "--allow");
                    // command.add(2, tempInputFile.getParent().toString());
                }
                returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                                .runCommandWithOutputHandling(
                                        command, tempInputFile.getParent().toFile());
            } else {

                returnCode =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
                                .runCommandWithOutputHandling(command);
            }

            pdfBytes = Files.readAllBytes(tempOutputFile);
        } catch (IOException e) {
            pdfBytes = Files.readAllBytes(tempOutputFile);
            if (pdfBytes.length < 1) {
                throw e;
            }
        } finally {

            // Clean up temporary files
            Files.delete(tempOutputFile);
            Files.delete(tempInputFile);

            if (fileName.endsWith(".zip")) {
                GeneralUtils.deleteDirectory(tempInputFile.getParent());
            }
        }

        return pdfBytes;
    }

    private static Path unzipAndGetMainHtml(byte[] fileBytes) throws IOException {
        Path tempDirectory = Files.createTempDirectory("unzipped_");
        try (ZipInputStream zipIn = new ZipInputStream(new ByteArrayInputStream(fileBytes))) {
            ZipEntry entry = zipIn.getNextEntry();
            while (entry != null) {
                Path filePath = tempDirectory.resolve(entry.getName());
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

        // search for the main HTML file.
        try (Stream<Path> walk = Files.walk(tempDirectory)) {
            List<Path> htmlFiles =
                    walk.filter(file -> file.toString().endsWith(".html"))
                            .collect(Collectors.toList());

            if (htmlFiles.isEmpty()) {
                throw new IOException("No HTML files found in the unzipped directory.");
            }

            // Prioritize 'index.html' if it exists, otherwise use the first .html file
            for (Path htmlFile : htmlFiles) {
                if (htmlFile.getFileName().toString().equals("index.html")) {
                    return htmlFile;
                }
            }

            return htmlFiles.get(0);
        }
    }

    public static byte[] convertBookTypeToPdf(byte[] bytes, String originalFilename)
            throws IOException, InterruptedException {
        if (originalFilename == null || originalFilename.lastIndexOf('.') == -1) {
            throw new IllegalArgumentException("Invalid original filename.");
        }

        String fileExtension = originalFilename.substring(originalFilename.lastIndexOf('.'));
        List<String> command = new ArrayList<>();
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");
        Path tempInputFile = null;

        try {
            // Create temp file with appropriate extension
            tempInputFile = Files.createTempFile("input_", fileExtension);
            Files.write(tempInputFile, bytes);

            command.add("ebook-convert");
            command.add(tempInputFile.toString());
            command.add(tempOutputFile.toString());
            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                            .runCommandWithOutputHandling(command);

            return Files.readAllBytes(tempOutputFile);
        } finally {
            // Clean up temporary files
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            Files.deleteIfExists(tempOutputFile);
        }
    }
}
