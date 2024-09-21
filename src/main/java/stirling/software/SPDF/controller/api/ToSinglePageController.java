package stirling.software.SPDF.controller.api;

import java.awt.geom.AffineTransform;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
public class ToSinglePageController {

    private static final Logger logger = LoggerFactory.getLogger(ToSinglePageController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public ToSinglePageController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-single-page")
    @Operation(
            summary = "Convert a multi-page PDF into a single long page PDF",
            description =
                    "This endpoint converts a multi-page PDF document into a single paged PDF document. The width of the single page will be same as the input's width, but the height will be the sum of all the pages' heights. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToSinglePage(@ModelAttribute PDFFile request)
            throws IOException {

        // Load the source document
        PDDocument sourceDocument = Loader.loadPDF(request.getFileInput().getBytes());

        // Calculate total height and max width
        float totalHeight = 0;
        float maxWidth = 0;
        for (PDPage page : sourceDocument.getPages()) {
            PDRectangle pageSize = page.getMediaBox();
            totalHeight += pageSize.getHeight();
            maxWidth = Math.max(maxWidth, pageSize.getWidth());
        }

        // Create new document and page with calculated dimensions
        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);
        PDPage newPage = new PDPage(new PDRectangle(maxWidth, totalHeight));
        newDocument.addPage(newPage);

        // Initialize the content stream of the new page
        PDPageContentStream contentStream = new PDPageContentStream(newDocument, newPage);
        contentStream.close();

        LayerUtility layerUtility = new LayerUtility(newDocument);
        float yOffset = totalHeight;

        // For each page, copy its content to the new page at the correct offset
        for (PDPage page : sourceDocument.getPages()) {
            PDFormXObject form =
                    layerUtility.importPageAsForm(
                            sourceDocument, sourceDocument.getPages().indexOf(page));
            AffineTransform af =
                    AffineTransform.getTranslateInstance(
                            0, yOffset - page.getMediaBox().getHeight());
            layerUtility.wrapInSaveRestore(newPage);
            String defaultLayerName = "Layer" + sourceDocument.getPages().indexOf(page);
            layerUtility.appendFormAsLayer(newPage, form, af, defaultLayerName);
            yOffset -= page.getMediaBox().getHeight();
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();
        sourceDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                result,
                request.getFileInput().getOriginalFilename().replaceFirst("[.][^.]+$", "")
                        + "_singlePage.pdf");
    }
}
