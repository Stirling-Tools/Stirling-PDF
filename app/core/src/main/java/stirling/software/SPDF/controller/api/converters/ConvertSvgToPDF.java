package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
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
    public ResponseEntity<Resource> convertSvgToPdf(@ModelAttribute SvgToPdfRequest request) {

        MultipartFile[] inputFiles = request.getFileInput();
        boolean combineIntoSinglePdf = Boolean.TRUE.equals(request.getCombineIntoSinglePdf());

        // Validate input
        if (inputFiles == null || inputFiles.length == 0) {
            log.error("No files provided for SVG to PDF conversion.");
            return errorResponse(HttpStatus.BAD_REQUEST, "No files provided");
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
                return errorResponse(HttpStatus.BAD_REQUEST, "No valid SVG files were found");
            }

            if (combineIntoSinglePdf) {
                return handleCombinedConversion(sanitizedSvgs, filenames);
            } else {
                return handleSeparateConversion(sanitizedSvgs, filenames);
            }

        } catch (Exception e) {
            log.error("Unexpected error during SVG to PDF conversion", e);
            return errorResponse(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "An unexpected error occurred during conversion");
        }
    }

    private ResponseEntity<Resource> errorResponse(HttpStatus status, String message) {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.status(status)
                .contentLength(body.length)
                .body(new ByteArrayResource(body));
    }

    private ResponseEntity<Resource> handleCombinedConversion(
            List<byte[]> sanitizedSvgs, List<String> filenames) {
        try {
            log.info("Combining {} SVG files into single PDF", sanitizedSvgs.size());

            byte[] pdfBytes = SvgToPdf.combineIntoPdf(sanitizedSvgs);

            if (pdfBytes == null || pdfBytes.length == 0) {
                log.error("PDF conversion failed - empty output");
                return errorResponse(
                        HttpStatus.INTERNAL_SERVER_ERROR, "PDF conversion failed - empty output");
            }

            pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);

            String outputFilename =
                    filenames.isEmpty()
                            ? "combined_svgs.pdf"
                            : GeneralUtils.generateFilename(filenames.get(0), "_combined.pdf");

            log.info("Successfully combined {} SVGs into single PDF", sanitizedSvgs.size());

            TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
            try {
                Files.write(tempOut.getPath(), pdfBytes);
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.pdfFileToWebResponse(tempOut, outputFilename);

        } catch (IOException e) {
            log.error("Error combining SVGs into PDF", e);
            return errorResponse(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Conversion failed: " + e.getMessage());
        }
    }

    private ResponseEntity<Resource> handleSeparateConversion(
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
            return errorResponse(
                    HttpStatus.INTERNAL_SERVER_ERROR, "No files were successfully converted");
        }

        try {
            if (convertedPdfs.size() == 1) {
                ConvertedPdf pdf = convertedPdfs.get(0);
                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    Files.write(tempOut.getPath(), pdf.content);
                } catch (Exception e) {
                    tempOut.close();
                    throw e;
                }
                return WebResponseUtils.pdfFileToWebResponse(tempOut, pdf.filename);
            }

            String zipFilename =
                    filenames.isEmpty()
                            ? "converted_svgs.zip"
                            : GeneralUtils.generateFilename(
                                    filenames.get(0), "_converted_svgs.zip");
            TempFile zipFile = createZipFromPdfs(convertedPdfs);
            return WebResponseUtils.zipFileToWebResponse(zipFile, zipFilename);
        } catch (IOException e) {
            log.error("Failed to create response", e);
            return errorResponse(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to create response");
        }
    }

    private TempFile createZipFromPdfs(List<ConvertedPdf> pdfs) throws IOException {
        TempFile tempZipFile = tempFileManager.createManagedTempFile(".zip");
        try (ZipOutputStream zipOut =
                new ZipOutputStream(Files.newOutputStream(tempZipFile.getPath()))) {
            for (ConvertedPdf pdf : pdfs) {
                ZipEntry pdfEntry = new ZipEntry(pdf.filename);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf.content);
                zipOut.closeEntry();
                log.debug("Added {} to ZIP", pdf.filename);
            }
        } catch (IOException e) {
            tempZipFile.close();
            throw e;
        }
        return tempZipFile;
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
