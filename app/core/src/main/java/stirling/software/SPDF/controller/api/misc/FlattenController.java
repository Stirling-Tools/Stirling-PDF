package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
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

import stirling.software.SPDF.model.api.misc.FlattenRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class FlattenController {

    // Size limits to prevent OutOfMemoryError
    private static final int MAX_IMAGE_WIDTH = 8192;
    private static final int MAX_IMAGE_HEIGHT = 8192;
    private static final long MAX_IMAGE_PIXELS = 16_777_216; // 4096x4096

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = "multipart/form-data", value = "/flatten")
    @Operation(
            summary = "Flatten PDF form fields or full page",
            description =
                    "Flattening just PDF form fields or converting each page to images to make text"
                            + " unselectable. Input:PDF, Output:PDF. Type:SISO")
    public ResponseEntity<byte[]> flatten(@ModelAttribute FlattenRequest request) throws Exception {
        MultipartFile file = request.getFileInput();

        PDDocument document = pdfDocumentFactory.load(file);
        Boolean flattenOnlyForms = request.getFlattenOnlyForms();

        if (Boolean.TRUE.equals(flattenOnlyForms)) {
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
            if (acroForm != null) {
                acroForm.flatten();
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    document, Filenames.toSimpleFileName(file.getOriginalFilename()));
        } else {
            // flatten whole page aka convert each page to image and readd it (making text
            // unselectable)
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document);
            int numPages = document.getNumberOfPages();
            for (int i = 0; i < numPages; i++) {
                PDPage originalPage = document.getPage(i);

                // Calculate what the image dimensions would be at 300 DPI
                int projectedWidth =
                        (int) Math.ceil(originalPage.getMediaBox().getWidth() * 300 / 72.0);
                int projectedHeight =
                        (int) Math.ceil(originalPage.getMediaBox().getHeight() * 300 / 72.0);
                long projectedPixels = (long) projectedWidth * projectedHeight;

                // Skip pages that would exceed memory limits
                if (projectedWidth > MAX_IMAGE_WIDTH
                        || projectedHeight > MAX_IMAGE_HEIGHT
                        || projectedPixels > MAX_IMAGE_PIXELS) {

                    log.warn(
                            "Skipping page {} - would exceed memory limits ({}x{} pixels)",
                            i + 1,
                            projectedWidth,
                            projectedHeight);

                    // Add original page without flattening
                    PDPage page = new PDPage();
                    page.setMediaBox(originalPage.getMediaBox());
                    newDocument.addPage(page);
                    continue;
                }

                try {
                    BufferedImage image = pdfRenderer.renderImageWithDPI(i, 300, ImageType.RGB);
                    PDPage page = new PDPage();
                    page.setMediaBox(originalPage.getMediaBox());
                    newDocument.addPage(page);
                    try (PDPageContentStream contentStream =
                            new PDPageContentStream(newDocument, page)) {
                        PDImageXObject pdImage = JPEGFactory.createFromImage(newDocument, image);
                        float pageWidth = page.getMediaBox().getWidth();
                        float pageHeight = page.getMediaBox().getHeight();

                        contentStream.drawImage(pdImage, 0, 0, pageWidth, pageHeight);
                    }
                } catch (IllegalArgumentException e) {
                    if (e.getMessage() != null
                            && e.getMessage().contains("Maximum size of image exceeded")) {
                        log.warn("Skipping page {} - image size exceeds PDFBox limits", i + 1);

                        // Add original page without flattening
                        PDPage page = new PDPage();
                        page.setMediaBox(originalPage.getMediaBox());
                        newDocument.addPage(page);
                        continue;
                    }
                    throw e;
                } catch (OutOfMemoryError e) {
                    log.warn("Skipping page {} - out of memory", i + 1);

                    // Add original page without flattening
                    PDPage page = new PDPage();
                    page.setMediaBox(originalPage.getMediaBox());
                    newDocument.addPage(page);
                    continue;
                } catch (IOException e) {
                    log.error("Error processing page {}", i + 1, e);

                    // Add original page without flattening
                    PDPage page = new PDPage();
                    page.setMediaBox(originalPage.getMediaBox());
                    newDocument.addPage(page);
                }
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    newDocument, Filenames.toSimpleFileName(file.getOriginalFilename()));
        }
    }
}
