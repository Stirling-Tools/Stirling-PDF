package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.io.ByteArrayOutputStream;
import com.itextpdf.kernel.pdf.*;
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Image;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.WebResponseUtils;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
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

        PdfReader reader = new PdfReader(file.getInputStream());
        PdfDocument sourceDocument = new PdfDocument(reader);
        
        float totalHeight = 0;
        float width = 0;

        for (int i = 1; i <= sourceDocument.getNumberOfPages(); i++) {
            Rectangle pageSize = sourceDocument.getPage(i).getPageSize();
            totalHeight += pageSize.getHeight();
            if(width < pageSize.getWidth())
            	width = pageSize.getWidth();
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);
        PdfDocument newDocument = new PdfDocument(writer);
        PageSize newPageSize = new PageSize(width, totalHeight);
        newDocument.addNewPage(newPageSize);

        Document layoutDoc = new Document(newDocument);
        float yOffset = totalHeight;

        for (int i = 1; i <= sourceDocument.getNumberOfPages(); i++) {
            PdfFormXObject pageCopy = sourceDocument.getPage(i).copyAsFormXObject(newDocument);
            Image copiedPage = new Image(pageCopy);
            copiedPage.setFixedPosition(0, yOffset - sourceDocument.getPage(i).getPageSize().getHeight());
            yOffset -= sourceDocument.getPage(i).getPageSize().getHeight();
            layoutDoc.add(copiedPage);
        }

        layoutDoc.close();
        sourceDocument.close();

        byte[] result = baos.toByteArray();
        return WebResponseUtils.bytesToWebResponse(result, file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_singlePage.pdf");
    }
}