package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
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

import stirling.software.SPDF.model.api.misc.AddPageNumbersRequest;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class PageNumbersController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/add-page-numbers", consumes = "multipart/form-data")
    @Operation(
            summary = "Add page numbers to a PDF document",
            description =
                    "This operation takes an input PDF file and adds page numbers to it. Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addPageNumbers(@ModelAttribute AddPageNumbersRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();
        String customMargin = request.getCustomMargin();
        int position = request.getPosition();
        int pageNumber = request.getStartingNumber();
        String pagesToNumber = request.getPagesToNumber();
        String customText = request.getCustomText();
        float fontSize = request.getFontSize();
        String fontType = request.getFontType();

        PDDocument document = pdfDocumentFactory.load(file);
        float marginFactor;
        switch (customMargin.toLowerCase()) {
            case "small":
                marginFactor = 0.02f;
                break;
            case "large":
                marginFactor = 0.05f;
                break;
            case "x-large":
                marginFactor = 0.075f;
                break;
            case "medium":
            default:
                marginFactor = 0.035f;
                break;
        }

        if (pagesToNumber == null || pagesToNumber.isEmpty()) {
            pagesToNumber = "all";
        }
        if (customText == null || customText.isEmpty()) {
            customText = "{n}";
        }
        List<Integer> pagesToNumberList =
                GeneralUtils.parsePageList(pagesToNumber.split(","), document.getNumberOfPages());

        for (int i : pagesToNumberList) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();

            String text =
                    customText
                            .replace("{n}", String.valueOf(pageNumber))
                            .replace("{total}", String.valueOf(document.getNumberOfPages()))
                            .replace(
                                    "{filename}",
                                    Filenames.toSimpleFileName(file.getOriginalFilename())
                                            .replaceFirst("[.][^.]+$", ""));

            PDType1Font currentFont =
                    switch (fontType.toLowerCase()) {
                        case "courier" -> new PDType1Font(Standard14Fonts.FontName.COURIER);
                        case "times" -> new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);
                        default -> new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                    };

            float x, y;

            if (position == 5) {
                // Calculate text width and font metrics
                float textWidth = currentFont.getStringWidth(text) / 1000 * fontSize;

                float ascent = currentFont.getFontDescriptor().getAscent() / 1000 * fontSize;
                float descent = currentFont.getFontDescriptor().getDescent() / 1000 * fontSize;

                float centerX = pageSize.getLowerLeftX() + (pageSize.getWidth() / 2);
                float centerY = pageSize.getLowerLeftY() + (pageSize.getHeight() / 2);

                x = centerX - (textWidth / 2);
                y = centerY - (ascent + descent) / 2;
            } else {
                int xGroup = (position - 1) % 3;
                int yGroup = 2 - (position - 1) / 3;

                x =
                        switch (xGroup) {
                            case 0 ->
                                    pageSize.getLowerLeftX()
                                            + marginFactor * pageSize.getWidth(); // left
                            case 1 ->
                                    pageSize.getLowerLeftX() + (pageSize.getWidth() / 2); // center
                            default ->
                                    pageSize.getUpperRightX()
                                            - marginFactor * pageSize.getWidth(); // right
                        };

                y =
                        switch (yGroup) {
                            case 0 ->
                                    pageSize.getLowerLeftY()
                                            + marginFactor * pageSize.getHeight(); // bottom
                            case 1 ->
                                    pageSize.getLowerLeftY() + (pageSize.getHeight() / 2); // middle
                            default ->
                                    pageSize.getUpperRightY()
                                            - marginFactor * pageSize.getHeight(); // top
                        };
            }

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);
            contentStream.beginText();
            contentStream.setFont(currentFont, fontSize);
            contentStream.newLineAtOffset(x, y);
            contentStream.showText(text);
            contentStream.endText();
            contentStream.close();

            pageNumber++;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                Filenames.toSimpleFileName(file.getOriginalFilename()).replaceFirst("[.][^.]+$", "")
                        + "_numbersAdded.pdf",
                MediaType.APPLICATION_PDF);
    }
}
