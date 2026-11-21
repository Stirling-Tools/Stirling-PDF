package stirling.software.SPDF.controller.api;

import java.awt.geom.AffineTransform;
import java.io.IOException;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@RequiredArgsConstructor
public class ToSinglePageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf-to-single-page",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert a multi-page PDF into a single long page PDF",
            description =
                    "This endpoint converts a multi-page PDF document into a single paged PDF"
                            + " document. The width of the single page will be same as the input's width, but"
                            + " the height will be the sum of all the pages' heights.")
    public ResponseEntity<Resource> pdfToSinglePage(@ModelAttribute PDFFile request)
            throws IOException {

        // Load the source document
        try (PDDocument sourceDocument = pdfDocumentFactory.load(request)) {
            // Calculate total height and max width
            float totalHeight = 0;
            float maxWidth = 0;
            for (PDPage page : sourceDocument.getPages()) {
                PDRectangle pageSize = displayedSize(page);
                totalHeight += pageSize.getHeight();
                maxWidth = Math.max(maxWidth, pageSize.getWidth());
            }

            // Create new document and page with calculated dimensions
            try (PDDocument newDocument =
                    pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument)) {
                PDPage newPage = new PDPage(new PDRectangle(maxWidth, totalHeight));
                newDocument.addPage(newPage);

                LayerUtility layerUtility = new LayerUtility(newDocument);
                float yOffset = totalHeight;

                // For each page, copy its content to the new page at the correct offset
                try {
                    layerUtility.wrapInSaveRestore(newPage);
                } catch (NullPointerException e) {
                }

                int pageIndex = 0;
                for (PDPage page : sourceDocument.getPages()) {
                    PDRectangle pageSize = displayedSize(page);
                    PDFormXObject form =
                            importUpright(layerUtility, sourceDocument, page, pageIndex);
                    if (form != null) {
                        AffineTransform af =
                                AffineTransform.getTranslateInstance(
                                        0, yOffset - pageSize.getHeight());
                        af.concatenate(rotationTransform(page));
                        String defaultLayerName = "Layer" + pageIndex;
                        layerUtility.appendFormAsLayer(newPage, form, af, defaultLayerName);
                    }
                    yOffset -= pageSize.getHeight();
                    pageIndex++;
                }

                return WebResponseUtils.pdfDocToWebResponse(
                        newDocument,
                        GeneralUtils.generateFilename(
                                request.getFileInput().getOriginalFilename(), ".pdf"),
                        tempFileManager);
            }
        }
    }

    private static PDRectangle displayedSize(PDPage page) {
        PDRectangle cropBox = page.getCropBox();
        int rotation = page.getRotation();
        return rotation == 90 || rotation == 270
                ? new PDRectangle(cropBox.getHeight(), cropBox.getWidth())
                : new PDRectangle(cropBox.getWidth(), cropBox.getHeight());
    }

    /**
     * Imports the page as a form that holds its crop box, upright, with the crop box's lower-left
     * corner at the origin. LayerUtility.importPageAsForm squeezes a rotated page into its
     * unrotated size and offsets a crop box that differs from the media box, so the page is
     * imported with no rotation and its media box set to its crop box, and both are restored
     * afterwards.
     */
    private static PDFormXObject importUpright(
            LayerUtility layerUtility, PDDocument document, PDPage page, int pageIndex)
            throws IOException {
        int rotation = page.getRotation();
        PDRectangle mediaBox = page.getMediaBox();
        page.setMediaBox(page.getCropBox());
        page.setRotation(0);
        try {
            return layerUtility.importPageAsForm(document, pageIndex);
        } finally {
            page.setRotation(rotation);
            page.setMediaBox(mediaBox);
        }
    }

    /** Turns a form from {@link #importUpright} the way the page's rotation displays it. */
    private static AffineTransform rotationTransform(PDPage page) {
        PDRectangle cropBox = page.getCropBox();
        float width = cropBox.getWidth();
        float height = cropBox.getHeight();
        return switch (page.getRotation()) {
            case 90 -> new AffineTransform(0, -1, 1, 0, 0, width);
            case 180 -> new AffineTransform(-1, 0, 0, -1, width, height);
            case 270 -> new AffineTransform(0, 1, -1, 0, height, 0);
            default -> new AffineTransform();
        };
    }
}
