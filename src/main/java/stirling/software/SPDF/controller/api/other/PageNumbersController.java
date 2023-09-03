package stirling.software.SPDF.controller.api.other;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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
    	int pageNumber = startingNumber;
    	byte[] fileBytes = file.getBytes();
        PDDocument document = PDDocument.load(fileBytes);

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
                marginFactor = 0.075f;
                break;   
                
                
            default:
                marginFactor = 0.035f;
                break;
        }

        float fontSize = 12.0f;
        PDType1Font font = PDType1Font.HELVETICA;
        if(pagesToNumber == null || pagesToNumber.length() == 0) {
        	pagesToNumber = "all";
        }
        if(customText == null || customText.length() == 0) {
        	customText = "{n}";
        }
        List<Integer> pagesToNumberList = GeneralUtils.parsePageList(pagesToNumber.split(","), document.getNumberOfPages());

        for (int i : pagesToNumberList) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();

            String text = customText != null ? customText.replace("{n}", String.valueOf(pageNumber)).replace("{total}", String.valueOf(document.getNumberOfPages())).replace("{filename}", file.getOriginalFilename().replaceFirst("[.][^.]+$", "")) : String.valueOf(pageNumber);

            float x, y;

            int xGroup = (position - 1) % 3;
            int yGroup = 2 - (position - 1) / 3;

            switch (xGroup) {
                case 0:  // left
                    x = pageSize.getLowerLeftX() + marginFactor * pageSize.getWidth();
                    break;
                case 1:  // center
                    x = pageSize.getLowerLeftX() + (pageSize.getWidth() / 2);
                    break;
                default: // right
                    x = pageSize.getUpperRightX() - marginFactor * pageSize.getWidth();
                    break;
            }

            switch (yGroup) {
                case 0:  // bottom
                    y = pageSize.getLowerLeftY() + marginFactor * pageSize.getHeight();
                    break;
                case 1:  // middle
                    y = pageSize.getLowerLeftY() + (pageSize.getHeight() / 2);
                    break;
                default: // top
                    y = pageSize.getUpperRightY() - marginFactor * pageSize.getHeight();
                    break;
            }

            PDPageContentStream contentStream = new PDPageContentStream(document, page, PDPageContentStream.AppendMode.APPEND, true);
            contentStream.beginText();
            contentStream.setFont(font, fontSize);
            contentStream.newLineAtOffset(x, y);
            contentStream.showText(text);
            contentStream.endText();
            contentStream.close();

            pageNumber++;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), file.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_numbersAdded.pdf", MediaType.APPLICATION_PDF);

    }



}
