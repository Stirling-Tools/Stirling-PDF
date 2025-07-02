package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
@RequiredArgsConstructor
public class OCRController {

    private final ApplicationProperties applicationProperties;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private boolean isOcrMyPdfEnabled() {
        return endpointConfiguration.isGroupEnabled("OCRmyPDF");
    }

    private boolean isTesseractEnabled() {
        return endpointConfiguration.isGroupEnabled("tesseract");
    }

    /** Gets the list of available Tesseract languages from the tessdata directory */
    public List<String> getAvailableTesseractLanguages() {
        String tessdataDir = applicationProperties.getSystem().getTessdataDir();
        File[] files = new File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !"osd".equalsIgnoreCase(lang))
                .toList();
    }

    @PostMapping(consumes = "multipart/form-data", value = "/ocr-pdf")
    @Operation(
            summary = "Process a PDF file with OCR",
            description =
                    "This endpoint processes a PDF file using OCR (Optical Character Recognition). "
                            + "Users can specify languages, sidecar, deskew, clean, cleanFinal, ocrType, ocrRenderType, and removeImagesAfter options. "
                            + "Uses OCRmyPDF if available, falls back to Tesseract. Input:PDF Output:PDF Type:SI-Conditional")
    public ResponseEntity<byte[]> processPdfWithOCR(
            @ModelAttribute ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        List<String> selectedLanguages = request.getLanguages();
        Boolean sidecar = request.isSidecar();
        Boolean deskew = request.isDeskew();
        Boolean clean = request.isClean();
        Boolean cleanFinal = request.isCleanFinal();
        String ocrType = request.getOcrType();
        String ocrRenderType = request.getOcrRenderType();
        Boolean removeImagesAfter = request.isRemoveImagesAfter();

        if (selectedLanguages == null || selectedLanguages.isEmpty()) {
            throw ExceptionUtils.createOcrLanguageRequiredException();
        }

        if (!"hocr".equals(ocrRenderType) && !"sandwich".equals(ocrRenderType)) {
            throw new IOException("ocrRenderType wrong");
        }

        // Get available Tesseract languages
        List<String> availableLanguages = getAvailableTesseractLanguages();

        // Validate selected languages
        selectedLanguages =
                selectedLanguages.stream().filter(availableLanguages::contains).toList();

        if (selectedLanguages.isEmpty()) {
            throw ExceptionUtils.createOcrInvalidLanguagesException();
        }

        // Use try-with-resources for proper temp file management
        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf");
                TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf")) {

            inputFile.transferTo(tempInputFile.getFile());

            TempFile sidecarTextFile = null;

            try {
                // Use OCRmyPDF if available (no fallback - error if it fails)
                if (isOcrMyPdfEnabled()) {
                    if (sidecar != null && sidecar) {
                        sidecarTextFile = new TempFile(tempFileManager, ".txt");
                    }

                    processWithOcrMyPdf(
                            selectedLanguages,
                            sidecar,
                            deskew,
                            clean,
                            cleanFinal,
                            ocrType,
                            ocrRenderType,
                            removeImagesAfter,
                            tempInputFile.getPath(),
                            tempOutputFile.getPath(),
                            sidecarTextFile != null ? sidecarTextFile.getPath() : null);
                    log.info("OCRmyPDF processing completed successfully");
                }
                // Use Tesseract only if OCRmyPDF is not available
                else if (isTesseractEnabled()) {
                    processWithTesseract(
                            selectedLanguages,
                            ocrType,
                            tempInputFile.getPath(),
                            tempOutputFile.getPath());
                    log.info("Tesseract processing completed successfully");
                } else {
                    throw ExceptionUtils.createOcrToolsUnavailableException();
                }

                // Read the processed PDF file
                byte[] pdfBytes = Files.readAllBytes(tempOutputFile.getPath());

                // Return the OCR processed PDF as a response
                String outputFilename =
                        Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                        .replaceFirst("[.][^.]+$", "")
                                + "_OCR.pdf";

                if (sidecar != null && sidecar && sidecarTextFile != null) {
                    // Create a zip file containing both the PDF and the text file
                    String outputZipFilename =
                            Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                            .replaceFirst("[.][^.]+$", "")
                                    + "_OCR.zip";

                    try (TempFile tempZipFile = new TempFile(tempFileManager, ".zip");
                            ZipOutputStream zipOut =
                                    new ZipOutputStream(
                                            Files.newOutputStream(tempZipFile.getPath()))) {

                        // Add PDF file to the zip
                        ZipEntry pdfEntry = new ZipEntry(outputFilename);
                        zipOut.putNextEntry(pdfEntry);
                        zipOut.write(pdfBytes);
                        zipOut.closeEntry();

                        // Add text file to the zip
                        ZipEntry txtEntry = new ZipEntry(outputFilename.replace(".pdf", ".txt"));
                        zipOut.putNextEntry(txtEntry);
                        Files.copy(sidecarTextFile.getPath(), zipOut);
                        zipOut.closeEntry();

                        zipOut.finish();

                        byte[] zipBytes = Files.readAllBytes(tempZipFile.getPath());

                        // Return the zip file containing both the PDF and the text file
                        return WebResponseUtils.bytesToWebResponse(
                                zipBytes, outputZipFilename, MediaType.APPLICATION_OCTET_STREAM);
                    }
                } else {
                    // Return the OCR processed PDF as a response
                    return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
                }

            } finally {
                // Clean up sidecar temp file if created
                if (sidecarTextFile != null) {
                    try {
                        sidecarTextFile.close();
                    } catch (Exception e) {
                        log.warn("Failed to close sidecar temp file", e);
                    }
                }
            }
        }
    }

    private void processWithOcrMyPdf(
            List<String> selectedLanguages,
            Boolean sidecar,
            Boolean deskew,
            Boolean clean,
            Boolean cleanFinal,
            String ocrType,
            String ocrRenderType,
            Boolean removeImagesAfter,
            Path tempInputFile,
            Path tempOutputFile,
            Path sidecarTextPath)
            throws IOException, InterruptedException {

        // Build OCRmyPDF command
        String languageOption = String.join("+", selectedLanguages);

        List<String> command =
                new ArrayList<>(
                        Arrays.asList(
                                "ocrmypdf",
                                "--verbose",
                                "2",
                                "--output-type",
                                "pdf",
                                "--pdf-renderer",
                                ocrRenderType));

        if (sidecar != null && sidecar && sidecarTextPath != null) {
            command.add("--sidecar");
            command.add(sidecarTextPath.toString());
        }

        if (deskew != null && deskew) {
            command.add("--deskew");
        }
        if (clean != null && clean) {
            command.add("--clean");
        }
        if (cleanFinal != null && cleanFinal) {
            command.add("--clean-final");
        }
        if (ocrType != null && !"".equals(ocrType)) {
            if ("skip-text".equals(ocrType)) {
                command.add("--skip-text");
            } else if ("force-ocr".equals(ocrType)) {
                command.add("--force-ocr");
            }
        }

        command.addAll(
                Arrays.asList(
                        "--language",
                        languageOption,
                        tempInputFile.toString(),
                        tempOutputFile.toString()));

        // Run CLI command
        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                        .runCommandWithOutputHandling(command);

        if (result.getRc() != 0
                && result.getMessages().contains("multiprocessing/synchronize.py")
                && result.getMessages().contains("OSError: [Errno 38] Function not implemented")) {
            command.add("--jobs");
            command.add("1");
            result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                            .runCommandWithOutputHandling(command);
        }

        if (result.getRc() != 0) {
            throw new IOException("OCRmyPDF failed with return code: " + result.getRc());
        }

        // Remove images from the OCR processed PDF if the flag is set to true
        if (removeImagesAfter != null && removeImagesAfter) {
            try (TempFile tempPdfWithoutImages = new TempFile(tempFileManager, "_no_images.pdf")) {
                List<String> gsCommand =
                        Arrays.asList(
                                "gs",
                                "-sDEVICE=pdfwrite",
                                "-dFILTERIMAGE",
                                "-o",
                                tempPdfWithoutImages.getPath().toString(),
                                tempOutputFile.toString());

                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(gsCommand);

                // Replace output file with version without images
                Files.copy(
                        tempPdfWithoutImages.getPath(),
                        tempOutputFile,
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    private void processWithTesseract(
            List<String> selectedLanguages, String ocrType, Path tempInputFile, Path tempOutputFile)
            throws IOException, InterruptedException {

        // Create temp directory for Tesseract processing
        try (TempDirectory tempDir = new TempDirectory(tempFileManager)) {
            File tempOutputDir = new File(tempDir.getPath().toFile(), "output");
            File tempImagesDir = new File(tempDir.getPath().toFile(), "images");
            File finalOutputFile = new File(tempDir.getPath().toFile(), "final_output.pdf");

            // Create directories
            tempOutputDir.mkdirs();
            tempImagesDir.mkdirs();

            PDFMergerUtility merger = new PDFMergerUtility();
            merger.setDestinationFileName(finalOutputFile.toString());

            try (PDDocument document = pdfDocumentFactory.load(tempInputFile.toFile())) {
                PDFRenderer pdfRenderer = new PDFRenderer(document);
                int pageCount = document.getNumberOfPages();

                for (int pageNum = 0; pageNum < pageCount; pageNum++) {
                    PDPage page = document.getPage(pageNum);
                    boolean hasText = false;

                    // Check for existing text
                    try (PDDocument tempDoc = new PDDocument()) {
                        tempDoc.addPage(page);
                        PDFTextStripper stripper = new PDFTextStripper();
                        hasText = !stripper.getText(tempDoc).trim().isEmpty();
                    }

                    boolean shouldOcr =
                            switch (ocrType) {
                                case "skip-text" -> !hasText;
                                case "force-ocr" -> true;
                                default -> true;
                            };

                    File pageOutputPath =
                            new File(tempOutputDir, String.format("page_%d.pdf", pageNum));

                    if (shouldOcr) {
                        // Convert page to image
                        BufferedImage image = pdfRenderer.renderImageWithDPI(pageNum, 300);
                        File imagePath =
                                new File(tempImagesDir, String.format("page_%d.png", pageNum));
                        ImageIO.write(image, "png", imagePath);

                        // Build OCR command
                        List<String> command = new ArrayList<>();
                        command.add("tesseract");
                        command.add(imagePath.toString());
                        command.add(
                                new File(tempOutputDir, String.format("page_%d", pageNum))
                                        .toString());
                        command.add("-l");
                        command.add(String.join("+", selectedLanguages));
                        command.add("pdf"); // Always output PDF

                        ProcessExecutorResult result =
                                ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT)
                                        .runCommandWithOutputHandling(command);

                        if (result.getRc() != 0) {
                            throw ExceptionUtils.createRuntimeException(
                                    "error.commandFailed",
                                    "{0} command failed with exit code: {1}",
                                    null,
                                    "Tesseract",
                                    result.getRc());
                        }

                        // Add OCR'd PDF to merger
                        merger.addSource(pageOutputPath);
                    } else {
                        // Save original page without OCR
                        try (PDDocument pageDoc = new PDDocument()) {
                            pageDoc.addPage(page);
                            pageDoc.save(pageOutputPath);
                            merger.addSource(pageOutputPath);
                        }
                    }
                }
            }

            // Merge all pages into final PDF
            merger.mergeDocuments(null);

            // Copy final output to the expected location
            Files.copy(
                    finalOutputFile.toPath(),
                    tempOutputFile,
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
