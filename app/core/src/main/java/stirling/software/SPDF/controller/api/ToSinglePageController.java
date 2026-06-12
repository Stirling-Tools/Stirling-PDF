package stirling.software.SPDF.controller.api;

import java.awt.geom.AffineTransform;
import java.io.IOException;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Path("/api/v1/general")
@ApplicationScoped
@RequiredArgsConstructor
public class ToSinglePageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/pdf-to-single-page")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf-to-single-page",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Convert a multi-page PDF into a single long page PDF",
            description =
                    "This endpoint converts a multi-page PDF document into a single paged PDF"
                            + " document. The width of the single page will be same as the input's"
                            + " width, but the height will be the sum of all the pages' heights."
                            + " Input:PDF Output:PDF Type:SISO")
    public Response pdfToSinglePage(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws IOException {

        PDFFile request = new PDFFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);

        // Load the source document
        try (PDDocument sourceDocument = pdfDocumentFactory.load(request)) {
            // Calculate total height and max width
            float totalHeight = 0;
            float maxWidth = 0;
            for (PDPage page : sourceDocument.getPages()) {
                PDRectangle pageSize = page.getMediaBox();
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
                    PDFormXObject form = layerUtility.importPageAsForm(sourceDocument, pageIndex);
                    if (form != null) {
                        AffineTransform af =
                                AffineTransform.getTranslateInstance(
                                        0, yOffset - page.getMediaBox().getHeight());
                        String defaultLayerName = "Layer" + pageIndex;
                        layerUtility.appendFormAsLayer(newPage, form, af, defaultLayerName);
                    }
                    yOffset -= page.getMediaBox().getHeight();
                    pageIndex++;
                }

                return WebResponseUtils.pdfDocToWebResponse(
                        newDocument,
                        GeneralUtils.generateFilename(
                                request.getFileInput().getOriginalFilename(), "_singlePage.pdf"),
                        tempFileManager);
            }
        }
    }
}
