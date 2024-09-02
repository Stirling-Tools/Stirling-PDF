package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import stirling.software.SPDF.model.api.misc.AddPageNumbersRequest;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class PageNumbersController {

    private static final Logger logger = LoggerFactory.getLogger(PageNumbersController.class);

    @PostMapping(value = "/add-page-numbers", consumes = "multipart/form-data")
    @Operation(
            summary = "Add page numbers to a PDF document",
            description =
                    "This operation takes an input PDF file and adds page numbers to it. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addPageNumbers(@ModelAttribute AddPageNumbersRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String customMargin = request.getCustomMargin();
        int position = request.getPosition();
        int startingNumber = request.getStartingNumber();
        String pagesToNumber = request.getPagesToNumber();
        String customText = request.getCustomText();
        int pageNumber = startingNumber;
        byte[] fileBytes = file.getBytes();
        PDDocument document = Loader.loadPDF(fileBytes);

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
        if (pagesToNumber == null || pagesToNumber.length() == 0) {
            pagesToNumber = "all";
        }
        if (customText == null || customText.length() == 0) {
            customText = "{n}";
        }
        List<Integer> pagesToNumberList =
                GeneralUtils.parsePageList(pagesToNumber.split(","), document.getNumberOfPages());

        for (int i : pagesToNumberList) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();

            String text =
                    customText != null
                            ? customText
                                    .replace("{n}", String.valueOf(pageNumber))
                                    .replace("{total}", String.valueOf(document.getNumberOfPages()))
                                    .replace(
                                            "{filename}",
                                            Filenames.toSimpleFileName(file.getOriginalFilename())
                                                    .replaceFirst("[.][^.]+$", ""))
                            : String.valueOf(pageNumber);

            float x, y;

            int xGroup = (position - 1) % 3;
            int yGroup = 2 - (position - 1) / 3;

            switch (xGroup) {
                case 0: // left
                    x = pageSize.getLowerLeftX() + marginFactor * pageSize.getWidth();
                    break;
                case 1: // center
                    x = pageSize.getLowerLeftX() + (pageSize.getWidth() / 2);
                    break;
                default: // right
                    x = pageSize.getUpperRightX() - marginFactor * pageSize.getWidth();
                    break;
            }

            switch (yGroup) {
                case 0: // bottom
                    y = pageSize.getLowerLeftY() + marginFactor * pageSize.getHeight();
                    break;
                case 1: // middle
                    y = pageSize.getLowerLeftY() + (pageSize.getHeight() / 2);
                    break;
                default: // top
                    y = pageSize.getUpperRightY() - marginFactor * pageSize.getHeight();
                    break;
            }

            PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true);
            contentStream.beginText();
            contentStream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), fontSize);
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
