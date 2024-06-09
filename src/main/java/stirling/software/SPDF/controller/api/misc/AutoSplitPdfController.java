package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class AutoSplitPdfController {

    private static final Logger logger = LoggerFactory.getLogger(AutoSplitPdfController.class);
    private static final String QR_CONTENT = "https://github.com/Stirling-Tools/Stirling-PDF";
    private static final String QR_CONTENT_OLD = "https://github.com/Frooodle/Stirling-PDF";

    @PostMapping(value = "/auto-split-pdf", consumes = "multipart/form-data")
    @Operation(
            summary = "Auto split PDF pages into separate documents",
            description =
                    "This endpoint accepts a PDF file, scans each page for a specific QR code, and splits the document at the QR code boundaries. The output is a zip file containing each separate PDF document. Input:PDF Output:ZIP-PDF Type:SISO")
    public ResponseEntity<byte[]> autoSplitPdf(@ModelAttribute AutoSplitPdfRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        boolean duplexMode = request.isDuplexMode();

        PDDocument document = Loader.loadPDF(file.getBytes());
        PDFRenderer pdfRenderer = new PDFRenderer(document);
        pdfRenderer.setSubsamplingAllowed(true);
        List<PDDocument> splitDocuments = new ArrayList<>();
        List<ByteArrayOutputStream> splitDocumentsBoas = new ArrayList<>();

        for (int page = 0; page < document.getNumberOfPages(); ++page) {
            BufferedImage bim = pdfRenderer.renderImageWithDPI(page, 150);
            String result = decodeQRCode(bim);
            if ((QR_CONTENT.equals(result) || QR_CONTENT_OLD.equals(result)) && page != 0) {
                splitDocuments.add(new PDDocument());
            }

            if (!splitDocuments.isEmpty()
                    && !QR_CONTENT.equals(result)
                    && !QR_CONTENT_OLD.equals(result)) {
                splitDocuments.get(splitDocuments.size() - 1).addPage(document.getPage(page));
            } else if (page == 0) {
                PDDocument firstDocument = new PDDocument();
                firstDocument.addPage(document.getPage(page));
                splitDocuments.add(firstDocument);
            }

            // If duplexMode is true and current page is a divider, then skip next page
            if (duplexMode && (QR_CONTENT.equals(result) || QR_CONTENT_OLD.equals(result))) {
                page++;
            }
        }

        // Remove split documents that have no pages
        splitDocuments.removeIf(pdDocument -> pdDocument.getNumberOfPages() == 0);

        for (PDDocument splitDocument : splitDocuments) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            splitDocument.save(baos);
            splitDocumentsBoas.add(baos);
            splitDocument.close();
        }

        document.close();

        Path zipFile = Files.createTempFile("split_documents", ".zip");
        String filename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");
        byte[] data;

        try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipFile))) {
            for (int i = 0; i < splitDocumentsBoas.size(); i++) {
                String fileName = filename + "_" + (i + 1) + ".pdf";
                ByteArrayOutputStream baos = splitDocumentsBoas.get(i);
                byte[] pdf = baos.toByteArray();

                ZipEntry pdfEntry = new ZipEntry(fileName);
                zipOut.putNextEntry(pdfEntry);
                zipOut.write(pdf);
                zipOut.closeEntry();
            }
        } catch (Exception e) {
            logger.error("exception", e);
        } finally {
            data = Files.readAllBytes(zipFile);
            Files.deleteIfExists(zipFile);
        }

        return WebResponseUtils.bytesToWebResponse(
                data, filename + ".zip", MediaType.APPLICATION_OCTET_STREAM);
    }

    private static String decodeQRCode(BufferedImage bufferedImage) {
        LuminanceSource source;

        if (bufferedImage.getRaster().getDataBuffer() instanceof DataBufferByte) {
            byte[] pixels = ((DataBufferByte) bufferedImage.getRaster().getDataBuffer()).getData();
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
        } else if (bufferedImage.getRaster().getDataBuffer() instanceof DataBufferInt) {
            int[] pixels = ((DataBufferInt) bufferedImage.getRaster().getDataBuffer()).getData();
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
                    "BufferedImage must have 8-bit gray scale, 24-bit RGB, 32-bit ARGB (packed int), byte gray, or 3-byte/4-byte RGB image data");
        }

        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));

        try {
            Result result = new MultiFormatReader().decode(bitmap);
            return result.getText();
        } catch (NotFoundException e) {
            return null; // there is no QR code in the image
        }
    }
}
