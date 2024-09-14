package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.FlattenRequest;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class FlattenController {

    private static final Logger logger = LoggerFactory.getLogger(FlattenController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public FlattenController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/flatten")
    @Operation(
            summary = "Flatten PDF form fields or full page",
            description =
                    "Flattening just PDF form fields or converting each page to images to make text unselectable. Input: PDF, Output: PDF. Type: SISO")
    public ResponseEntity<byte[]> flatten(@ModelAttribute FlattenRequest request) throws Exception {
        MultipartFile file = request.getFileInput();

        PDDocument document = Loader.loadPDF(file.getBytes());
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
            PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(document);
            int numPages = document.getNumberOfPages();
            for (int i = 0; i < numPages; i++) {
                try {
                    BufferedImage image = pdfRenderer.renderImageWithDPI(i, 300, ImageType.RGB);
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
                } catch (IOException e) {
                    logger.error("exception", e);
                }
            }
            return WebResponseUtils.pdfDocToWebResponse(
                    newDocument, Filenames.toSimpleFileName(file.getOriginalFilename()));
        }
    }
}
