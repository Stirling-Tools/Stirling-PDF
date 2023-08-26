package stirling.software.SPDF.controller.api.other;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfReader;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.properties.TextAlignment;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Other", description = "Other APIs")
public class PageNumbersController {

    private static final Logger logger = LoggerFactory.getLogger(PageNumbersController.class);

    @PostMapping(value = "/add-page-numbers", consumes = "multipart/form-data")
    @Operation(summary = "Add page numbers to a PDF document", description = "This operation takes an input PDF file and adds page numbers to it. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addPageNumbers(
        @Parameter(description = "The input PDF file", required = true) @RequestParam("fileInput") MultipartFile file,
        @Parameter(description = "Custom margin: small/medium/large", required = true, schema = @Schema(type = "string", allowableValues = {"small", "medium", "large"})) @RequestParam("customMargin") String customMargin,
        @Parameter(description = "Position: 1 of 9 positions", required = true, schema = @Schema(type = "integer", minimum = "1", maximum = "9")) @RequestParam("position") int position,
        @Parameter(description = "Starting number", required = true, schema = @Schema(type = "integer", minimum = "1")) @RequestParam("startingNumber") int startingNumber,
        @Parameter(description = "Which pages to number, default all", required = false, schema = @Schema(type = "string")) @RequestParam(value = "pagesToNumber", required = false) String pagesToNumber,
        @Parameter(description = "Custom text: defaults to just number but can have things like \"Page {n} of {p}\"", required = false, schema = @Schema(type = "string")) @RequestParam(value = "customText", required = false) String customText)
        throws IOException {

        byte[] fileBytes = file.getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(fileBytes);

        int pageNumber = startingNumber;
        float marginFactor;
        switch (customMargin.toLowerCase()) {
            case "small":
                marginFactor = 0.02f;
                break;
            case "medium":
                marginFactor = 0.035f;
                break;
            case "large":
                marginFactor = 0.05f;
                break;
            case "x-large":
                marginFactor = 0.1f;
                break;
            default:
                marginFactor = 0.035f;
                break;
        }

        float fontSize = 12.0f;

        PdfReader reader = new PdfReader(bais);
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PdfWriter writer = new PdfWriter(baos);

        PdfDocument pdfDoc = new PdfDocument(reader, writer);

        List<Integer> pagesToNumberList = GeneralUtils.parsePageList(pagesToNumber.split(","), pdfDoc.getNumberOfPages());

        for (int i : pagesToNumberList) {
            PdfPage page = pdfDoc.getPage(i+1);
            Rectangle pageSize = page.getPageSize();
            PdfCanvas pdfCanvas = new PdfCanvas(page.newContentStreamAfter(), page.getResources(), pdfDoc);

            String text = customText != null ? customText.replace("{n}", String.valueOf(pageNumber)).replace("{total}", String.valueOf(pdfDoc.getNumberOfPages())).replace("{filename}", file.getOriginalFilename().replaceFirst("[.][^.]+$", "")) : String.valueOf(pageNumber);

            PdfFont font = PdfFontFactory.createFont(StandardFonts.HELVETICA);
            float textWidth = font.getWidth(text, fontSize);
            float textHeight = font.getAscent(text, fontSize) - font.getDescent(text, fontSize);

            float x, y;
            TextAlignment alignment;

            int xGroup = (position - 1) % 3;
            int yGroup = 2 - (position - 1) / 3;

            switch (xGroup) {
                case 0:  // left
                    x = pageSize.getLeft() + marginFactor * pageSize.getWidth();
                    alignment = TextAlignment.LEFT;
                    break;
                case 1:  // center
                    x = pageSize.getLeft() + (pageSize.getWidth()) / 2;
                    alignment = TextAlignment.CENTER;
                    break;
                default: // right
                    x = pageSize.getRight() - marginFactor * pageSize.getWidth();
                    alignment = TextAlignment.RIGHT;
                    break;
            }

            switch (yGroup) {
            case 0:  // bottom
                y = pageSize.getBottom() +   marginFactor * pageSize.getHeight();
                break;
            case 1:  // middle
                y = pageSize.getBottom() + (pageSize.getHeight() ) / 2;
                break;
            default: // top
                y = pageSize.getTop() - marginFactor * pageSize.getHeight();
                break;
        }

            new Canvas(pdfCanvas, page.getPageSize())
                    .showTextAligned(new Paragraph(text).setFont(font).setFontSize(fontSize), x, y, alignment);

            pageNumber++;
        }


        pdfDoc.close();
        byte[] resultBytes = baos.toByteArray();

        return WebResponseUtils.bytesToWebResponse(resultBytes, URLEncoder.encode(file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_numbersAdded.pdf", "UTF-8"), MediaType.APPLICATION_PDF);

    }



}
