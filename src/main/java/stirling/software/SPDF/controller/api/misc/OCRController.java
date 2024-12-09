package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.BoundedLineReader;
import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
public class OCRController {

    @Autowired private ApplicationProperties applicationProperties;

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public OCRController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
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
                .filter(lang -> !lang.equalsIgnoreCase("osd"))
                .collect(Collectors.toList());
    }

    @PostMapping(consumes = "multipart/form-data", value = "/ocr-pdf")
    public ResponseEntity<byte[]> processPdfWithOCR(
            @ModelAttribute ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        List<String> languages = request.getLanguages();
        String ocrType = request.getOcrType();

        Path tempDir = Files.createTempDirectory("ocr_process");
        Path tempInputFile = tempDir.resolve("input.pdf");
        Path tempOutputDir = tempDir.resolve("output");
        Path tempImagesDir = tempDir.resolve("images");
        Path finalOutputFile = tempDir.resolve("final_output.pdf");

        Files.createDirectories(tempOutputDir);
        Files.createDirectories(tempImagesDir);

        try {
            // Save input file
            inputFile.transferTo(tempInputFile.toFile());
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

                    Path pageOutputPath =
                            tempOutputDir.resolve(String.format("page_%d.pdf", pageNum));

                    if (shouldOcr) {
                        // Convert page to image
                        BufferedImage image = pdfRenderer.renderImageWithDPI(pageNum, 300);
                        Path imagePath =
                                tempImagesDir.resolve(String.format("page_%d.png", pageNum));
                        ImageIO.write(image, "png", imagePath.toFile());

                        // Build OCR command
                        List<String> command = new ArrayList<>();
                        command.add("tesseract");
                        command.add(imagePath.toString());
                        command.add(
                                tempOutputDir
                                        .resolve(String.format("page_%d", pageNum))
                                        .toString());
                        command.add("-l");
                        command.add(String.join("+", languages));
                        command.add("pdf"); // Always output PDF

                        ProcessBuilder pb = new ProcessBuilder(command);
                        Process process = pb.start();

                        // Capture any error output
                        try (BufferedReader reader =
                                new BufferedReader(
                                        new InputStreamReader(process.getErrorStream()))) {
                            String line;
                            while ((line = BoundedLineReader.readLine(reader, 5_000_000)) != null) {
                                log.debug("Tesseract: {}", line);
                            }
                        }

                        int exitCode = process.waitFor();
                        if (exitCode != 0) {
                            throw new RuntimeException(
                                    "Tesseract failed with exit code: " + exitCode);
                        }

                        // Add OCR'd PDF to merger
                        merger.addSource(pageOutputPath.toFile());
                    } else {
                        // Save original page without OCR
                        try (PDDocument pageDoc = new PDDocument()) {
                            pageDoc.addPage(page);
                            pageDoc.save(pageOutputPath.toFile());
                            merger.addSource(pageOutputPath.toFile());
                        }
                    }
                }
            }

            // Merge all pages into final PDF
            merger.mergeDocuments(null);

            // Read the final PDF file
            byte[] pdfContent = Files.readAllBytes(finalOutputFile);
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
            // Clean up temporary files
            deleteDirectory(tempDir);
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

    private void deleteDirectory(Path directory) {
        try {
            Files.walk(directory)
                    .sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.delete(path);
                                } catch (IOException e) {
                                    log.error("Error deleting {}: {}", path, e.getMessage());
                                }
                            });
        } catch (IOException e) {
            log.error("Error walking directory {}: {}", directory, e.getMessage());
        }
    }
}
