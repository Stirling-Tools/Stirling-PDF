package stirling.software.SPDF.controller.api;

import java.awt.geom.AffineTransform;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Image;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.multipdf.LayerUtility;
@RestController
@Tag(name = "General", description = "General APIs")
public class ToSinglePageController {

    private static final Logger logger = LoggerFactory.getLogger(ToSinglePageController.class);

   
    @PostMapping(consumes = "multipart/form-data", value = "/pdf-to-single-page")
    @Operation(
        summary = "Convert a multi-page PDF into a single long page PDF",
        description = "This endpoint converts a multi-page PDF document into a single paged PDF document. The width of the single page will be same as the input's width, but the height will be the sum of all the pages' heights. Input:PDF Output:PDF Type:SISO"
    )
    public ResponseEntity<byte[]> pdfToSinglePage(
        @RequestPart(required = true, value = "fileInput")
        @Parameter(description = "The input multi-page PDF file to be converted into a single page", required = true)
            MultipartFile file) throws IOException {

    	PDDocument sourceDocument = PDDocument.load(file.getInputStream());
        float totalHeight = 0;
        float width = 0;

        for (PDPage page : sourceDocument.getPages()) {
            PDRectangle pageSize = page.getMediaBox();
            totalHeight += pageSize.getHeight();
            if(width < pageSize.getWidth())
                width = pageSize.getWidth();
        }

        PDDocument newDocument = new PDDocument();
        PDPage newPage = new PDPage(new PDRectangle(width, totalHeight));
        newDocument.addPage(newPage);

        LayerUtility layerUtility = new LayerUtility(newDocument);
        float yOffset = totalHeight;

        for (PDPage page : sourceDocument.getPages()) {
            PDFormXObject form = layerUtility.importPageAsForm(sourceDocument, sourceDocument.getPages().indexOf(page));
            AffineTransform af = AffineTransform.getTranslateInstance(0, yOffset - page.getMediaBox().getHeight());
            layerUtility.appendFormAsLayer(newDocument.getPage(0), form, af, page.getResources().getCOSObject().toString());
            yOffset -= page.getMediaBox().getHeight();
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        newDocument.save(baos);
        newDocument.close();
        sourceDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(result, file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_singlePage.pdf");
    }
}