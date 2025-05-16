package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.multipdf.LayerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/general")
@Tag(name = "General", description = "General APIs")
@RequiredArgsConstructor
public class CropController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/crop", consumes = "multipart/form-data")
    @Operation(
            summary = "Crops a PDF document",
            description =
                    "This operation takes an input PDF file and crops it according to the given"
                            + " coordinates. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> cropPdf(@ModelAttribute CropPdfForm request) throws IOException {
        PDDocument sourceDocument = pdfDocumentFactory.load(request);

        PDDocument newDocument =
                pdfDocumentFactory.createNewDocumentBasedOnOldDocument(sourceDocument);

        int totalPages = sourceDocument.getNumberOfPages();

        LayerUtility layerUtility = new LayerUtility(newDocument);

        for (int i = 0; i < totalPages; i++) {
            PDPage sourcePage = sourceDocument.getPage(i);

            // Create a new page with the size of the source page
            PDPage newPage = new PDPage(sourcePage.getMediaBox());
            newDocument.addPage(newPage);
            PDPageContentStream contentStream =
                    new PDPageContentStream(newDocument, newPage, AppendMode.OVERWRITE, true, true);

            // Import the source page as a form XObject
            PDFormXObject formXObject = layerUtility.importPageAsForm(sourceDocument, i);

            contentStream.saveGraphicsState();

            // Define the crop area
            contentStream.addRect(
                    request.getX(), request.getY(), request.getWidth(), request.getHeight());
            contentStream.clip();

            // Draw the entire formXObject
            contentStream.drawForm(formXObject);

            contentStream.restoreGraphicsState();

            contentStream.close();

            // Now, set the new page's media box to the cropped size
            newPage.setMediaBox(
                    new PDRectangle(
                            request.getX(),
                            request.getY(),
                            request.getWidth(),
                            request.getHeight()));
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();
        sourceDocument.close();

        byte[] pdfContent = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(
                pdfContent,
                request.getFileInput().getOriginalFilename().replaceFirst("[.][^.]+$", "")
                        + "_cropped.pdf");
    }
}
