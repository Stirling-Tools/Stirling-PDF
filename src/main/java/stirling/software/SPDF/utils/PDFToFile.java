package stirling.software.SPDF.utils;

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

import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

@Slf4j
@NoArgsConstructor
public class PDFToFile {

    public ResponseEntity<byte[]> processPdfToMarkdown(MultipartFile inputFile)
            throws IOException, InterruptedException {
        if (!"application/pdf".equals(inputFile.getContentType())) {
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

        Path tempInputFile = null;
        Path tempOutputDir = null;
        byte[] fileBytes;
        String fileName = "temp.file";

        try {
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);
            tempOutputDir = Files.createTempDirectory("output_");

            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "pdftohtml",
                                    "-s",
                                    "-noframes",
                                    "-c",
                                    tempInputFile.toString(),
                                    pdfBaseName));

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.PDFTOHTML)
                            .runCommandWithOutputHandling(command, tempOutputDir.toFile());
            // Process HTML files to Markdown
            File[] outputFiles = Objects.requireNonNull(tempOutputDir.toFile().listFiles());
            List<File> markdownFiles = new ArrayList<>();

            // Convert HTML files to Markdown
            for (File outputFile : outputFiles) {
                if (outputFile.getName().endsWith(".html")) {
                    String html = Files.readString(outputFile.toPath());
                    String markdown = htmlToMarkdownConverter.convert(html);

                    String mdFileName = outputFile.getName().replace(".html", ".md");
                    File mdFile = new File(tempOutputDir.toFile(), mdFileName);
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

        } finally {
            if (tempInputFile != null) Files.deleteIfExists(tempInputFile);
            if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
        }
        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }

    public ResponseEntity<byte[]> processPdfToHtml(MultipartFile inputFile)
            throws IOException, InterruptedException {
        if (!"application/pdf".equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        // Get the original PDF file name without the extension
        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String pdfBaseName = originalPdfFileName;
        if (originalPdfFileName.contains(".")) {
            pdfBaseName = originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'));
        }

        Path tempInputFile = null;
        Path tempOutputDir = null;
        byte[] fileBytes;
        String fileName = "temp.file";

        try {
            // Save the uploaded file to a temporary location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);

            // Prepare the output directory
            tempOutputDir = Files.createTempDirectory("output_");

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

        } finally {
            // Clean up the temporary files
            if (tempInputFile != null) Files.deleteIfExists(tempInputFile);
            if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
        }

        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }

    public ResponseEntity<byte[]> processPdfToOfficeFormat(
            MultipartFile inputFile, String outputFormat, String libreOfficeFilter)
            throws IOException, InterruptedException {

        if (!"application/pdf".equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        // Get the original PDF file name without the extension
        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());

        if (originalPdfFileName == null || "".equals(originalPdfFileName.trim())) {
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

        Path tempInputFile = null;
        Path tempOutputDir = null;
        byte[] fileBytes;
        String fileName = "temp.file";

        try {
            // Save the uploaded file to a temporary location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);

            // Prepare the output directory
            tempOutputDir = Files.createTempDirectory("output_");

            // Run the LibreOffice command
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "soffice",
                                    "--headless",
                                    "--nologo",
                                    "--infilter=" + libreOfficeFilter,
                                    "--convert-to",
                                    outputFormat,
                                    "--outdir",
                                    tempOutputDir.toString(),
                                    tempInputFile.toString()));
            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                            .runCommandWithOutputHandling(command);

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
            // Clean up the temporary files
            Files.deleteIfExists(tempInputFile);
            if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
        }
        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }
}
