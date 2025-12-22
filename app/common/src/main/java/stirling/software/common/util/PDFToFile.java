package stirling.software.common.util;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.IOUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import com.vladsch.flexmark.html2md.converter.FlexmarkHtmlConverter;
import com.vladsch.flexmark.util.data.MutableDataSet;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

@Slf4j
public class PDFToFile {

    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;

    public PDFToFile(TempFileManager tempFileManager) {
        this(tempFileManager, null);
    }

    public PDFToFile(TempFileManager tempFileManager, RuntimePathConfig runtimePathConfig) {
        this.tempFileManager = tempFileManager;
        this.runtimePathConfig = runtimePathConfig;
    }

    public ResponseEntity<byte[]> processPdfToMarkdown(MultipartFile inputFile)
            throws IOException, InterruptedException {
        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        MutableDataSet options =
                new MutableDataSet()
                        .set(
                                FlexmarkHtmlConverter.MAX_BLANK_LINES,
                                2) // Control max consecutive blank lines
                        .set(
                                FlexmarkHtmlConverter.MAX_TRAILING_BLANK_LINES,
                                1) // Control trailing blank lines
                        .set(
                                FlexmarkHtmlConverter.SETEXT_HEADINGS,
                                true) // Use Setext headings for h1 and h2
                        .set(
                                FlexmarkHtmlConverter.OUTPUT_UNKNOWN_TAGS,
                                false) // Don't output HTML for unknown tags
                        .set(
                                FlexmarkHtmlConverter.TYPOGRAPHIC_QUOTES,
                                true) // Convert quotation marks
                        .set(
                                FlexmarkHtmlConverter.BR_AS_PARA_BREAKS,
                                true) // Convert <br> to paragraph breaks
                        .set(FlexmarkHtmlConverter.CODE_INDENT, "    "); // Indent for code blocks

        FlexmarkHtmlConverter htmlToMarkdownConverter =
                FlexmarkHtmlConverter.builder(options).build();

        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String pdfBaseName = originalPdfFileName;
        if (originalPdfFileName.contains(".")) {
            pdfBaseName = originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'));
        }

        byte[] fileBytes;
        String fileName;

        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf");
                TempDirectory tempOutputDir = new TempDirectory(tempFileManager)) {
            inputFile.transferTo(tempInputFile.getFile());

            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "pdftohtml",
                                    "-s",
                                    "-noframes",
                                    "-c",
                                    tempInputFile.getAbsolutePath(),
                                    pdfBaseName));

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML)
                            .runCommandWithOutputHandling(
                                    command, tempOutputDir.getPath().toFile());
            // Process HTML files to Markdown
            File[] outputFiles =
                    Objects.requireNonNull(tempOutputDir.getPath().toFile().listFiles());
            List<File> markdownFiles = new ArrayList<>();

            // Convert HTML files to Markdown
            for (File outputFile : outputFiles) {
                if (outputFile.getName().endsWith(".html")) {
                    String html = Files.readString(outputFile.toPath());
                    String markdown = htmlToMarkdownConverter.convert(html);

                    String mdFileName = outputFile.getName().replace(".html", ".md");
                    File mdFile = new File(tempOutputDir.getPath().toFile(), mdFileName);
                    Files.writeString(mdFile.toPath(), markdown);
                    markdownFiles.add(mdFile);
                }
            }

            // If there's only one markdown file, return it directly
            if (markdownFiles.size() == 1) {
                fileName = pdfBaseName + ".md";
                fileBytes = Files.readAllBytes(markdownFiles.get(0).toPath());
            } else {
                // Multiple files - create a zip
                fileName = pdfBaseName + "ToMarkdown.zip";
                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();

                try (ZipOutputStream zipOutputStream = new ZipOutputStream(byteArrayOutputStream)) {
                    // Add markdown files
                    for (File mdFile : markdownFiles) {
                        ZipEntry mdEntry = new ZipEntry(mdFile.getName());
                        zipOutputStream.putNextEntry(mdEntry);
                        Files.copy(mdFile.toPath(), zipOutputStream);
                        zipOutputStream.closeEntry();
                    }

                    // Add images and other assets
                    for (File file : outputFiles) {
                        if (!file.getName().endsWith(".html") && !file.getName().endsWith(".md")) {
                            ZipEntry assetEntry = new ZipEntry(file.getName());
                            zipOutputStream.putNextEntry(assetEntry);
                            Files.copy(file.toPath(), zipOutputStream);
                            zipOutputStream.closeEntry();
                        }
                    }
                }

                fileBytes = byteArrayOutputStream.toByteArray();
            }
        }
        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }

    public ResponseEntity<byte[]> processPdfToHtml(MultipartFile inputFile)
            throws IOException, InterruptedException {
        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        // Get the original PDF file name without the extension
        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String pdfBaseName = originalPdfFileName;
        if (originalPdfFileName.contains(".")) {
            pdfBaseName = originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'));
        }

        byte[] fileBytes;
        String fileName;

        try (TempFile inputFileTemp = new TempFile(tempFileManager, ".pdf");
                TempDirectory outputDirTemp = new TempDirectory(tempFileManager)) {

            Path tempInputFile = inputFileTemp.getPath();
            Path tempOutputDir = outputDirTemp.getPath();

            // Save the uploaded file to a temporary location
            inputFile.transferTo(tempInputFile);

            // Run the pdftohtml command with complex output
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "pdftohtml", "-c", tempInputFile.toString(), pdfBaseName));

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML)
                            .runCommandWithOutputHandling(command, tempOutputDir.toFile());

            // Get output files
            File[] outputFiles = Objects.requireNonNull(tempOutputDir.toFile().listFiles());

            // Return output files in a ZIP archive
            fileName = pdfBaseName + "ToHtml.zip";
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            try (ZipOutputStream zipOutputStream = new ZipOutputStream(byteArrayOutputStream)) {
                for (File outputFile : outputFiles) {
                    ZipEntry entry = new ZipEntry(outputFile.getName());
                    zipOutputStream.putNextEntry(entry);
                    try (FileInputStream fis = new FileInputStream(outputFile)) {
                        IOUtils.copy(fis, zipOutputStream);
                    } catch (IOException e) {
                        log.error("Exception writing zip entry", e);
                    }
                    zipOutputStream.closeEntry();
                }
            } catch (IOException e) {
                log.error("Exception writing zip", e);
            }
            fileBytes = byteArrayOutputStream.toByteArray();
        }

        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }

    public ResponseEntity<byte[]> processPdfToOfficeFormat(
            MultipartFile inputFile, String outputFormat, String libreOfficeFilter)
            throws IOException, InterruptedException {

        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        // Get the original PDF file name without the extension
        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());

        if (originalPdfFileName == null || originalPdfFileName.trim().isEmpty()) {
            originalPdfFileName = "output.pdf";
        }
        // Assume file is pdf if no extension
        String pdfBaseName = originalPdfFileName;
        if (originalPdfFileName.contains(".")) {
            pdfBaseName = originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'));
        }
        // Validate output format
        List<String> allowedFormats =
                Arrays.asList("doc", "docx", "odt", "ppt", "pptx", "odp", "rtf", "xml", "txt:Text");
        if (!allowedFormats.contains(outputFormat)) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        byte[] fileBytes;
        String fileName;

        Path libreOfficeProfile = null;
        try (TempFile inputFileTemp = new TempFile(tempFileManager, ".pdf");
                TempDirectory outputDirTemp = new TempDirectory(tempFileManager)) {

            Path tempInputFile = inputFileTemp.getPath();
            Path tempOutputDir = outputDirTemp.getPath();
            Path unoOutputFile =
                    tempOutputDir.resolve(
                            pdfBaseName + "." + resolvePrimaryExtension(outputFormat));

            // Save the uploaded file to a temporary location
            inputFile.transferTo(tempInputFile);

            // Run the LibreOffice command
            ProcessExecutorResult returnCode = null;
            IOException unoconvertException = null;

            if (isUnoConvertEnabled()) {
                try {
                    List<String> unoCommand =
                            buildUnoConvertCommand(
                                    tempInputFile, unoOutputFile, outputFormat, libreOfficeFilter);
                    returnCode =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                    .runCommandWithOutputHandling(unoCommand);
                } catch (IOException e) {
                    unoconvertException = e;
                    log.warn(
                            "Unoconvert command failed ({}). Falling back to soffice command.",
                            e.getMessage());
                }
            }

            if (returnCode == null) {
                // Run the LibreOffice command as a fallback
                libreOfficeProfile = Files.createTempDirectory("libreoffice_profile_");
                List<String> command = new ArrayList<>();
                command.add(runtimePathConfig.getSOfficePath());
                command.add("-env:UserInstallation=" + libreOfficeProfile.toUri().toString());
                command.add("--headless");
                command.add("--nologo");
                command.add("--infilter=" + libreOfficeFilter);
                command.add("--convert-to");
                command.add(outputFormat);
                command.add("--outdir");
                command.add(tempOutputDir.toString());
                command.add(tempInputFile.toString());

                try {
                    returnCode =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                    .runCommandWithOutputHandling(command);
                } catch (IOException e) {
                    if (unoconvertException != null) {
                        e.addSuppressed(unoconvertException);
                    }
                    throw e;
                }
            }

            // Get output files
            List<File> outputFiles = Arrays.asList(tempOutputDir.toFile().listFiles());

            if (outputFiles.size() == 1) {
                // Return single output file
                File outputFile = outputFiles.get(0);
                if ("txt:Text".equals(outputFormat)) {
                    outputFormat = "txt";
                }
                fileName = pdfBaseName + "." + outputFormat;
                fileBytes = FileUtils.readFileToByteArray(outputFile);
            } else {
                // Return output files in a ZIP archive
                fileName = pdfBaseName + "To" + outputFormat + ".zip";
                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                try (ZipOutputStream zipOutputStream = new ZipOutputStream(byteArrayOutputStream)) {
                    for (File outputFile : outputFiles) {
                        ZipEntry entry = new ZipEntry(outputFile.getName());
                        zipOutputStream.putNextEntry(entry);
                        try (FileInputStream fis = new FileInputStream(outputFile)) {
                            IOUtils.copy(fis, zipOutputStream);
                        } catch (IOException e) {
                            log.error("Exception writing zip entry", e);
                        }

                        zipOutputStream.closeEntry();
                    }
                } catch (IOException e) {
                    log.error("Exception writing zip", e);
                }

                fileBytes = byteArrayOutputStream.toByteArray();
            }
        } finally {
            if (libreOfficeProfile != null) {
                FileUtils.deleteQuietly(libreOfficeProfile.toFile());
            }
        }
        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }

    private boolean isUnoConvertEnabled() {
        return runtimePathConfig != null
                && runtimePathConfig.getUnoConvertPath() != null
                && !runtimePathConfig.getUnoConvertPath().isBlank();
    }

    private List<String> buildUnoConvertCommand(
            Path inputFile, Path outputFile, String outputFormat, String libreOfficeFilter) {
        List<String> command = new ArrayList<>();
        command.add(runtimePathConfig.getUnoConvertPath());
        command.add("--port");
        command.add("2003");
        command.add("--convert-to");
        command.add(outputFormat);
        if (libreOfficeFilter != null && !libreOfficeFilter.isBlank()) {
            command.add("--input-filter=" + libreOfficeFilter);
        }
        command.add(inputFile.toString());
        command.add(outputFile.toString());
        return command;
    }

    private String resolvePrimaryExtension(String outputFormat) {
        if (outputFormat == null) {
            return "";
        }
        int colonIndex = outputFormat.indexOf(':');
        return colonIndex > 0 ? outputFormat.substring(0, colonIndex) : outputFormat;
    }
}
