package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class AutoSplitPdfController {

    private static final Set<String> VALID_QR_CONTENTS =
            new HashSet<>(
                    Set.of(
                            "https://github.com/Stirling-Tools/Stirling-PDF",
                            "https://github.com/Frooodle/Stirling-PDF",
                            "https://stirlingpdf.com"));

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static String decodeQRCode(BufferedImage bufferedImage) {
        LuminanceSource source;

        if (bufferedImage.getRaster().getDataBuffer() instanceof DataBufferByte dataBufferByte) {
            byte[] pixels = dataBufferByte.getData();
            source =
                    new PlanarYUVLuminanceSource(
                            pixels,
                            bufferedImage.getWidth(),
                            bufferedImage.getHeight(),
                            0,
                            0,
                            bufferedImage.getWidth(),
                            bufferedImage.getHeight(),
                            false);
        } else if (bufferedImage.getRaster().getDataBuffer()
                instanceof DataBufferInt dataBufferInt) {
            int[] pixels = dataBufferInt.getData();
            byte[] newPixels = new byte[pixels.length];
            for (int i = 0; i < pixels.length; i++) {
                newPixels[i] = (byte) (pixels[i] & 0xff);
            }
            source =
                    new PlanarYUVLuminanceSource(
                            newPixels,
                            bufferedImage.getWidth(),
                            bufferedImage.getHeight(),
                            0,
                            0,
                            bufferedImage.getWidth(),
                            bufferedImage.getHeight(),
                            false);
        } else {
            throw new IllegalArgumentException(
                    "BufferedImage must have 8-bit gray scale, 24-bit RGB, 32-bit ARGB (packed"
                            + " int), byte gray, or 3-byte/4-byte RGB image data");
        }

        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));

        try {
            Result result = new MultiFormatReader().decode(bitmap);
            return result.getText();
        } catch (NotFoundException e) {
            return null; // there is no QR code in the image
        }
    }

    @PostMapping(value = "/auto-split-pdf", consumes = "multipart/form-data")
    @Operation(
            summary = "Auto split PDF pages into separate documents",
            description =
                    "This endpoint accepts a PDF file, scans each page for a specific QR code, and"
                            + " splits the document at the QR code boundaries. The output is a zip file"
                            + " containing each separate PDF document. Input:PDF Output:ZIP-PDF"
                            + " Type:SISO")
    public ResponseEntity<byte[]> autoSplitPdf(@ModelAttribute AutoSplitPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean duplexMode = Boolean.TRUE.equals(request.getDuplexMode());

        PDDocument document = null;
        List<PDDocument> splitDocuments = new ArrayList<>();
        Path zipFile = null;
        byte[] data = null;

        try {
            document = pdfDocumentFactory.load(file.getInputStream());
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);

            for (int page = 0; page < document.getNumberOfPages(); ++page) {
                BufferedImage bim = pdfRenderer.renderImageWithDPI(page, 150);
                String result = decodeQRCode(bim);

                boolean isValidQrCode = VALID_QR_CONTENTS.contains(result);
                log.debug("detected qr code {}, code is vale={}", result, isValidQrCode);
                if (isValidQrCode && page != 0) {
                    splitDocuments.add(new PDDocument());
                }

                if (!splitDocuments.isEmpty() && !isValidQrCode) {
                    splitDocuments.get(splitDocuments.size() - 1).addPage(document.getPage(page));
                } else if (page == 0) {
                    PDDocument firstDocument = new PDDocument();
                    firstDocument.addPage(document.getPage(page));
                    splitDocuments.add(firstDocument);
                }

                // If duplexMode is true and current page is a divider, then skip next page
                if (duplexMode && isValidQrCode) {
                    page++;
                }
            }

            // Remove split documents that have no pages
            splitDocuments.removeIf(pdDocument -> pdDocument.getNumberOfPages() == 0);

            zipFile = Files.createTempFile("split_documents", ".zip");
            String filename =
                    Filenames.toSimpleFileName(file.getOriginalFilename())
                            .replaceFirst("[.][^.]+$", "");

            try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
                for (int i = 0; i < splitDocuments.size(); i++) {
                    String fileName = filename + "_" + (i + 1) + ".pdf";
                    PDDocument splitDocument = splitDocuments.get(i);

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    splitDocument.save(baos);
                    byte[] pdf = baos.toByteArray();

                    ZipEntry pdfEntry = new ZipEntry(fileName);
                    zipOut.putNextEntry(pdfEntry);
                    zipOut.write(pdf);
                    zipOut.closeEntry();
                }
            }

            data = Files.readAllBytes(zipFile);

            return WebResponseUtils.bytesToWebResponse(
                    data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
        } catch (Exception e) {
            log.error("Error in auto split", e);
            throw e;
        } finally {
            // Clean up resources
            if (document != null) {
                try {
                    document.close();
                } catch (IOException e) {
                    log.error("Error closing main PDDocument", e);
                }
            }

            for (PDDocument splitDoc : splitDocuments) {
                try {
                    splitDoc.close();
                } catch (IOException e) {
                    log.error("Error closing split PDDocument", e);
                }
            }

            if (zipFile != null) {
                try {
                    Files.deleteIfExists(zipFile);
                } catch (IOException e) {
                    log.error("Error deleting temporary zip file", e);
                }
            }
        }
    }
}
