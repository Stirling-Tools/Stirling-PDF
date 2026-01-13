package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.converters.SvgToPdfRequest;
import stirling.software.SPDF.utils.SvgToPdf;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertSvgToPDF {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final SvgSanitizer svgSanitizer;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/svg/pdf")
    @MultiFileResponse
    @Operation(
            summary = "Convert SVG to PDF",
            description =
                    "This endpoint converts one or more SVG (Scalable Vector Graphics) files to PDF format. "
                            + "Each SVG is converted to a separate PDF file. "
                            + "The conversion preserves vector graphics for crisp output at any resolution - no rasterization occurs. "
                            + "SVG dimensions (width/height) determine the PDF page size; defaults to A4 if not specified. "
                            + "SVG content is sanitized to prevent XSS attacks. "
                            + "Input: SVG file(s), Output: PDF file(s) or ZIP. Type: MIMO")
    public ResponseEntity<byte[]> convertSvgToPdf(@ModelAttribute SvgToPdfRequest request) {

        MultipartFile[] inputFiles = request.getFileInput();
        boolean combineIntoSinglePdf = Boolean.TRUE.equals(request.getCombineIntoSinglePdf());
        String fitOption = request.getFitOption();
        boolean autoRotate = Boolean.TRUE.equals(request.getAutoRotate());

        // Set defaults for combine options
        if (fitOption == null || fitOption.isEmpty()) {
            fitOption = "maintainAspectRatio";
        }

        // Validate input
        if (inputFiles == null || inputFiles.length == 0) {
            log.error("No files provided for SVG to PDF conversion.");
            return ResponseEntity.badRequest()
                    .body("No files provided".getBytes(StandardCharsets.UTF_8));
        }

        try {
            List<byte[]> sanitizedSvgs = new ArrayList<>();
            List<String> filenames = new ArrayList<>();

            for (MultipartFile inputFile : inputFiles) {
                if (inputFile == null || inputFile.isEmpty()) {
                    log.warn("Skipping empty file in batch conversion");
                    continue;
                }

                String originalFilename = inputFile.getOriginalFilename();
                if (originalFilename == null || originalFilename.trim().isEmpty()) {
                    log.warn("Skipping file with null or empty filename");
                    continue;
                }

                String lowerFilename = originalFilename.toLowerCase(Locale.ROOT);
                if (!lowerFilename.endsWith(".svg")) {
                    log.warn("Skipping non-SVG file: {}", originalFilename);
                    continue;
                }

                try {
                    byte[] fileBytes = inputFile.getBytes();
                    byte[] sanitizedBytes = svgSanitizer.sanitize(fileBytes);
                    sanitizedSvgs.add(sanitizedBytes);
                    filenames.add(Filenames.toSimpleFileName(originalFilename));

                } catch (IOException e) {
                    log.error(
                            "SVG sanitization/reading failed for {}: {}",
                            originalFilename,
                            e.getMessage());
                }
            }

            if (sanitizedSvgs.isEmpty()) {
                log.error("No valid SVG files were found");
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body("No valid SVG files were found".getBytes(StandardCharsets.UTF_8));
            }

            if (combineIntoSinglePdf) {
                return handleCombinedConversion(sanitizedSvgs, filenames, fitOption, autoRotate);
            } else {
                return handleSeparateConversion(sanitizedSvgs, filenames);
            }

        } catch (Exception e) {
            log.error("Unexpected error during SVG to PDF conversion", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            "An unexpected error occurred during conversion"
                                    .getBytes(StandardCharsets.UTF_8));
        }
    }

    private ResponseEntity<byte[]> handleCombinedConversion(
            List<byte[]> sanitizedSvgs,
            List<String> filenames,
            String fitOption,
            boolean autoRotate) {
        try {
            log.info("Combining {} SVG files into single PDF", sanitizedSvgs.size());

            byte[] pdfBytes = SvgToPdf.combineIntoPdf(sanitizedSvgs, fitOption, autoRotate);

            if (pdfBytes == null || pdfBytes.length == 0) {
                log.error("PDF conversion failed - empty output");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(
                                "PDF conversion failed - empty output"
                                        .getBytes(StandardCharsets.UTF_8));
            }

            pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

            String outputFilename =
                    filenames.isEmpty()
                            ? "combined_svgs.pdf"
                            : GeneralUtils.generateFilename(filenames.get(0), "_combined.pdf");

            log.info("Successfully combined {} SVGs into single PDF", sanitizedSvgs.size());

            return WebResponseUtils.bytesToWebResponse(
                    pdfBytes, outputFilename, MediaType.APPLICATION_PDF);

        } catch (IOException e) {
            log.error("Error combining SVGs into PDF", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(
                            ("Conversion failed: " + e.getMessage())
                                    .getBytes(StandardCharsets.UTF_8));
        }
    }

    private ResponseEntity<byte[]> handleSeparateConversion(
            List<byte[]> sanitizedSvgs, List<String> filenames) {
        List<ConvertedPdf> convertedPdfs = new ArrayList<>();

        for (int i = 0; i < sanitizedSvgs.size(); i++) {
            byte[] sanitizedBytes = sanitizedSvgs.get(i);
            String baseFilename = filenames.get(i);

            try {
                byte[] pdfBytes = SvgToPdf.convert(sanitizedBytes);

                if (pdfBytes == null || pdfBytes.length == 0) {
                    log.error("PDF conversion failed - empty output for {}", baseFilename);
                    continue;
                }

                pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

                String outputFilename = GeneralUtils.generateFilename(baseFilename, ".pdf");
                convertedPdfs.add(new ConvertedPdf(outputFilename, pdfBytes));

                log.info("Successfully converted SVG to PDF: {}", baseFilename);

            } catch (IOException e) {
                log.error("File processing error for SVG to PDF: {}", baseFilename, e);
            }
        }

        if (convertedPdfs.isEmpty()) {
            log.error("No files were successfully converted");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("No files were successfully converted".getBytes(StandardCharsets.UTF_8));
        }

        try {
            if (convertedPdfs.size() == 1) {
                ConvertedPdf pdf = convertedPdfs.get(0);
                return WebResponseUtils.bytesToWebResponse(
                        pdf.content, pdf.filename, MediaType.APPLICATION_PDF);
            }

            String zipFilename =
                    filenames.isEmpty()
                            ? "converted_svgs.zip"
                            : GeneralUtils.generateFilename(
                                    filenames.get(0), "_converted_svgs.zip");
            byte[] zipBytes = createZipFromPdfs(convertedPdfs);

            return WebResponseUtils.bytesToWebResponse(
                    zipBytes, zipFilename, MediaType.APPLICATION_OCTET_STREAM);
        } catch (IOException e) {
            log.error("Failed to create response", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to create response".getBytes(StandardCharsets.UTF_8));
        }
    }

    private byte[] createZipFromPdfs(List<ConvertedPdf> pdfs) throws IOException {
        try (TempFile tempZipFile = new TempFile(tempFileManager, ".zip");
                ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(tempZipFile.getPath()))) {

            for (ConvertedPdf pdf : pdfs) {
                ZipEntry pdfEntry = new ZipEntry(pdf.filename);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf.content);
                zipOut.closeEntry();
                log.debug("Added {} to ZIP", pdf.filename);
            }

            return Files.readAllBytes(tempZipFile.getPath());
        }
    }

    private static class ConvertedPdf {
        final String filename;
        final byte[] content;

        ConvertedPdf(String filename, byte[] content) {
            this.filename = filename;
            this.content = content;
        }
    }
}
