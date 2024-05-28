package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.Overlay;
import org.apache.pdfbox.pdmodel.PDDocument;
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

import stirling.software.SPDF.model.api.general.OverlayPdfsRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class PdfOverlayController {

    @PostMapping(value = "/overlay-pdfs", consumes = "multipart/form-data")
    @Operation(
            summary = "Overlay PDF files in various modes",
            description =
                    "Overlay PDF files onto a base PDF with different modes: Sequential, Interleaved, or Fixed Repeat. Input:PDF Output:PDF Type:MIMO")
    public ResponseEntity<byte[]> overlayPdfs(@ModelAttribute OverlayPdfsRequest request)
            throws IOException {
        MultipartFile baseFile = request.getFileInput();
        int overlayPos = request.getOverlayPosition();

        MultipartFile[] overlayFiles = request.getOverlayFiles();
        File[] overlayPdfFiles = new File[overlayFiles.length];
        List<File> tempFiles = new ArrayList<>(); // List to keep track of temporary files

        try {
            for (int i = 0; i < overlayFiles.length; i++) {
                overlayPdfFiles[i] = GeneralUtils.multipartToFile(overlayFiles[i]);
            }

            String mode = request.getOverlayMode(); // "SequentialOverlay", "InterleavedOverlay",
            // "FixedRepeatOverlay"
            int[] counts = request.getCounts(); // Used for FixedRepeatOverlay mode

            try (PDDocument basePdf = Loader.loadPDF(baseFile.getBytes());
                    Overlay overlay = new Overlay()) {
                Map<Integer, String> overlayGuide =
                        prepareOverlayGuide(
                                basePdf.getNumberOfPages(),
                                overlayPdfFiles,
                                mode,
                                counts,
                                tempFiles);

                overlay.setInputPDF(basePdf);
                if (overlayPos == 0) {
                    overlay.setOverlayPosition(Overlay.Position.FOREGROUND);
                } else {
                    overlay.setOverlayPosition(Overlay.Position.BACKGROUND);
                }

                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                overlay.overlay(overlayGuide).save(outputStream);
                byte[] data = outputStream.toByteArray();
                String outputFilename =
                        Filenames.toSimpleFileName(baseFile.getOriginalFilename())
                                        .replaceFirst("[.][^.]+$", "")
                                + "_overlayed.pdf"; // Remove file extension and append .pdf

                return WebResponseUtils.bytesToWebResponse(
                        data, outputFilename, MediaType.APPLICATION_PDF);
            }
        } finally {
            for (File overlayPdfFile : overlayPdfFiles) {
                if (overlayPdfFile != null) {
                    Files.deleteIfExists(overlayPdfFile.toPath());
                }
            }
            for (File tempFile : tempFiles) { // Delete temporary files
                if (tempFile != null) {
                    Files.deleteIfExists(tempFile.toPath());
                }
            }
        }
    }

    private Map<Integer, String> prepareOverlayGuide(
            int basePageCount, File[] overlayFiles, String mode, int[] counts, List<File> tempFiles)
            throws IOException {
        Map<Integer, String> overlayGuide = new HashMap<>();
        switch (mode) {
            case "SequentialOverlay":
                sequentialOverlay(overlayGuide, overlayFiles, basePageCount, tempFiles);
                break;
            case "InterleavedOverlay":
                interleavedOverlay(overlayGuide, overlayFiles, basePageCount);
                break;
            case "FixedRepeatOverlay":
                fixedRepeatOverlay(overlayGuide, overlayFiles, counts, basePageCount);
                break;
            default:
                throw new IllegalArgumentException("Invalid overlay mode");
        }
        return overlayGuide;
    }

    private void sequentialOverlay(
            Map<Integer, String> overlayGuide,
            File[] overlayFiles,
            int basePageCount,
            List<File> tempFiles)
            throws IOException {
        int overlayFileIndex = 0;
        int pageCountInCurrentOverlay = 0;

        for (int basePageIndex = 1; basePageIndex <= basePageCount; basePageIndex++) {
            if (pageCountInCurrentOverlay == 0
                    || pageCountInCurrentOverlay
                            >= getNumberOfPages(overlayFiles[overlayFileIndex])) {
                pageCountInCurrentOverlay = 0;
                overlayFileIndex = (overlayFileIndex + 1) % overlayFiles.length;
            }

            try (PDDocument overlayPdf = Loader.loadPDF(overlayFiles[overlayFileIndex])) {
                PDDocument singlePageDocument = new PDDocument();
                singlePageDocument.addPage(overlayPdf.getPage(pageCountInCurrentOverlay));
                File tempFile = Files.createTempFile("overlay-page-", ".pdf").toFile();
                singlePageDocument.save(tempFile);
                singlePageDocument.close();

                overlayGuide.put(basePageIndex, tempFile.getAbsolutePath());
                tempFiles.add(tempFile); // Keep track of the temporary file for cleanup
            }

            pageCountInCurrentOverlay++;
        }
    }

    private int getNumberOfPages(File file) throws IOException {
        try (PDDocument doc = Loader.loadPDF(file)) {
            return doc.getNumberOfPages();
        }
    }

    private void interleavedOverlay(
            Map<Integer, String> overlayGuide, File[] overlayFiles, int basePageCount)
            throws IOException {
        for (int basePageIndex = 1; basePageIndex <= basePageCount; basePageIndex++) {
            File overlayFile = overlayFiles[(basePageIndex - 1) % overlayFiles.length];

            // Load the overlay document to check its page count
            try (PDDocument overlayPdf = Loader.loadPDF(overlayFile)) {
                int overlayPageCount = overlayPdf.getNumberOfPages();
                if ((basePageIndex - 1) % overlayPageCount < overlayPageCount) {
                    overlayGuide.put(basePageIndex, overlayFile.getAbsolutePath());
                }
            }
        }
    }

    private void fixedRepeatOverlay(
            Map<Integer, String> overlayGuide, File[] overlayFiles, int[] counts, int basePageCount)
            throws IOException {
        if (overlayFiles.length != counts.length) {
            throw new IllegalArgumentException(
                    "Counts array length must match the number of overlay files");
        }
        int currentPage = 1;
        for (int i = 0; i < overlayFiles.length; i++) {
            File overlayFile = overlayFiles[i];
            int repeatCount = counts[i];

            // Load the overlay document to check its page count
            try (PDDocument overlayPdf = Loader.loadPDF(overlayFile)) {
                int overlayPageCount = overlayPdf.getNumberOfPages();
                for (int j = 0; j < repeatCount; j++) {
                    for (int page = 0; page < overlayPageCount; page++) {
                        if (currentPage > basePageCount) break;
                        overlayGuide.put(currentPage++, overlayFile.getAbsolutePath());
                    }
                }
            }
        }
    }
}

// Additional classes like OverlayPdfsRequest, WebResponseUtils, etc. are assumed to be defined
// elsewhere.
