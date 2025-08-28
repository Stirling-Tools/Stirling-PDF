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

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    /**
     * Calculate safe DPI to prevent memory issues based on page size
     */
    private int calculateSafeDPI(PDPage page, int requestedDPI) {
        // Maximum safe image dimensions to prevent OOM
        final int MAX_WIDTH = 8192;
        final int MAX_HEIGHT = 8192;
        final long MAX_PIXELS = 16_777_216; // 4096x4096
        
        float pageWidthPts = page.getMediaBox().getWidth();
        float pageHeightPts = page.getMediaBox().getHeight();
        
        // Calculate projected dimensions at requested DPI
        int projectedWidth = (int) Math.ceil(pageWidthPts * requestedDPI / 72.0);
        int projectedHeight = (int) Math.ceil(pageHeightPts * requestedDPI / 72.0);
        long projectedPixels = (long) projectedWidth * projectedHeight;
        
        // Calculate scaling factors if needed
        if (projectedWidth <= MAX_WIDTH && projectedHeight <= MAX_HEIGHT && projectedPixels <= MAX_PIXELS) {
            return requestedDPI; // Safe to use requested DPI
        }
        
        double widthScale = (double) MAX_WIDTH / projectedWidth;
        double heightScale = (double) MAX_HEIGHT / projectedHeight;
        double pixelScale = Math.sqrt((double) MAX_PIXELS / projectedPixels);
        double minScale = Math.min(Math.min(widthScale, heightScale), pixelScale);
        
        return (int) Math.max(72, requestedDPI * minScale);
    }

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
                try {
                    // Calculate safe DPI to prevent memory issues
                    PDPage originalPage = document.getPage(i);
                    int safeDPI = calculateSafeDPI(originalPage, 300);
                    
                    BufferedImage image;
                    try {
                        image = pdfRenderer.renderImageWithDPI(i, safeDPI, ImageType.RGB);
                    } catch (IllegalArgumentException e) {
                        if (e.getMessage() != null && e.getMessage().contains("Maximum size of image exceeded")) {
                            // Fall back to lower DPI if still too large
                            safeDPI = Math.max(72, safeDPI / 2);
                            image = pdfRenderer.renderImageWithDPI(i, safeDPI, ImageType.RGB);
                        } else {
                            throw e;
                        }
                    }
                    
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
                } catch (IOException e) {
                    log.error("exception", e);
                }
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    newDocument, Filenames.toSimpleFileName(file.getOriginalFilename()));
        }
    }
}
