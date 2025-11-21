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

import stirling.software.SPDF.model.api.misc.FlattenRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class FlattenController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/flatten")
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
            // flatten whole page aka convert each page to image and re-add it (making text
            // unselectable)
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document);

            int defaultRenderDpi = 100; // Default fallback
            ApplicationProperties properties =
                    ApplicationContextProvider.getBean(ApplicationProperties.class);
            Integer configuredMaxDpi = null;
            if (properties != null && properties.getSystem() != null) {
                configuredMaxDpi = properties.getSystem().getMaxDPI();
            }

            int maxDpi =
                    (configuredMaxDpi != null && configuredMaxDpi > 0)
                            ? configuredMaxDpi
                            : defaultRenderDpi;

            Integer requestedDpi = request.getRenderDpi();
            int renderDpiTemp = maxDpi;
            if (requestedDpi != null) {
                renderDpiTemp = Math.min(requestedDpi, maxDpi);
                renderDpiTemp = Math.max(renderDpiTemp, 72);
            }
            final int renderDpi = renderDpiTemp;

            int numPages = document.getNumberOfPages();
            for (int i = 0; i < numPages; i++) {
                final int pageIndex = i;
                BufferedImage image = null;
                try {
                    // Validate dimensions BEFORE rendering to prevent OOM
                    ExceptionUtils.validateRenderingDimensions(
                            document.getPage(pageIndex), pageIndex + 1, renderDpi);

                    // Wrap entire rendering operation to catch OutOfMemoryError from any depth
                    image =
                            ExceptionUtils.handleOomRendering(
                                    pageIndex + 1,
                                    renderDpi,
                                    () ->
                                            pdfRenderer.renderImageWithDPI(
                                                    pageIndex, renderDpi, ImageType.RGB));

                    PDPage page = new PDPage();
                    page.setMediaBox(document.getPage(i).getMediaBox());
                    newDocument.addPage(page);
                    try (PDPageContentStream contentStream =
                            new PDPageContentStream(newDocument, page)) {
                        PDImageXObject pdImage = JPEGFactory.createFromImage(newDocument, image);
                        float pageWidth = page.getMediaBox().getWidth();
                        float pageHeight = page.getMediaBox().getHeight();

                        contentStream.drawImage(pdImage, 0, 0, pageWidth, pageHeight);
                    }
                } catch (ExceptionUtils.OutOfMemoryDpiException e) {
                    // Re-throw OutOfMemoryDpiException to be handled by GlobalExceptionHandler
                    newDocument.close();
                    document.close();
                    throw e;
                } catch (IOException e) {
                    log.error("IOException during page processing: ", e);
                    // Continue processing other pages
                } catch (OutOfMemoryError e) {
                    // Catch any OutOfMemoryError that escaped the inner try block
                    newDocument.close();
                    document.close();
                    throw ExceptionUtils.createOutOfMemoryDpiException(i + 1, renderDpi, e);
                } finally {
                    // Help GC by clearing the image reference
                    image = null;
                }
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    newDocument, Filenames.toSimpleFileName(file.getOriginalFilename()));
        }
    }
}
