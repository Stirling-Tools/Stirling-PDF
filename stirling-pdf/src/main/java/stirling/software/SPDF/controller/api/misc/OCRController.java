package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.*;
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

import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
@RequiredArgsConstructor
public class OCRController {

    private final ApplicationProperties applicationProperties;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

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
            summary = "Process PDF files with OCR using Tesseract",
            description =
                    "Takes a PDF file as input, performs OCR using specified languages and OCR type"
                            + " (skip-text/force-ocr), and returns the processed PDF. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> processPdfWithOCR(
            @ModelAttribute ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        List<String> languages = request.getLanguages();
        String ocrType = request.getOcrType();

        // Create a temp directory using TempFileManager directly
        Path tempDirPath = tempFileManager.createTempDirectory();
        File tempDir = tempDirPath.toFile();

        try {
            File tempInputFile = new File(tempDir, "input.pdf");
            File tempOutputDir = new File(tempDir, "output");
            File tempImagesDir = new File(tempDir, "images");
            File finalOutputFile = new File(tempDir, "final_output.pdf");

            // Create directories
            tempOutputDir.mkdirs();
            tempImagesDir.mkdirs();

            // Save input file
            inputFile.transferTo(tempInputFile);

            PDFMergerUtility merger = new PDFMergerUtility();
            merger.setDestinationFileName(finalOutputFile.toString());

            try (PDDocument document = pdfDocumentFactory.load(tempInputFile)) {
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
                        command.add(String.join("+", languages));
                        // Always output PDF
                        command.add("pdf");

                        // Use ProcessExecutor to run tesseract command
                        try {
                            ProcessExecutorResult result =
                                    ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT)
                                            .runCommandWithOutputHandling(command);

                            log.debug(
                                    "Tesseract OCR completed for page {} with exit code {}",
                                    pageNum,
                                    result.getRc());

                            // Add OCR'd PDF to merger
                            merger.addSource(pageOutputPath);
                        } catch (IOException | InterruptedException e) {
                            log.error(
                                    "Error processing page {} with tesseract: {}",
                                    pageNum,
                                    e.getMessage());
                            // If OCR fails, fall back to the original page
                            try (PDDocument pageDoc = new PDDocument()) {
                                pageDoc.addPage(page);
                                pageDoc.save(pageOutputPath);
                                merger.addSource(pageOutputPath);
                            }
                        }
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

            // Read the final PDF file
            byte[] pdfContent = java.nio.file.Files.readAllBytes(finalOutputFile.toPath());
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_OCR.pdf";

            return ResponseEntity.ok()
                    .header(
                            "Content-Disposition",
                            "attachment; filename=\"" + outputFilename + "\"")
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(pdfContent);
        } finally {
            // Clean up the temp directory and all its contents
            tempFileManager.deleteTempDirectory(tempDirPath);
        }
    }

    private void addFileToZip(File file, String filename, ZipOutputStream zipOut)
            throws IOException {
        if (!file.exists()) {
            log.warn("File {} does not exist, skipping", file);
            return;
        }
        try (FileInputStream fis = new FileInputStream(file)) {
            ZipEntry zipEntry = new ZipEntry(filename);
            zipOut.putNextEntry(zipEntry);
            byte[] buffer = new byte[1024];
            int length;
            while ((length = fis.read(buffer)) >= 0) {
                zipOut.write(buffer, 0, length);
            }
            zipOut.closeEntry();
        }
    }
}
