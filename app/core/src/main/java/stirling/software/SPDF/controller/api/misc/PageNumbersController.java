package stirling.software.SPDF.controller.api.misc;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Locale;

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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class PageNumbersController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/add-page-numbers", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
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
        String fontColor = request.getFontColor();

        Color color = Color.BLACK;
        if (fontColor != null && !fontColor.trim().isEmpty()) {
            try {
                color = Color.decode(fontColor);
            } catch (NumberFormatException e) {
                color = Color.BLACK;
            }
        }

        PDDocument document = pdfDocumentFactory.load(file);

        float marginFactor =
                switch (customMargin == null ? "" : customMargin.toLowerCase(Locale.ROOT)) {
                    case "small" -> 0.02f;
                    case "large" -> 0.05f;
                    case "x-large" -> 0.075f;
                    case "medium" -> 0.035f;
                    default -> 0.035f;
                };

        if (pagesToNumber == null || pagesToNumber.isEmpty()) {
            pagesToNumber = "all";
        }
        if (customText == null || customText.isEmpty()) {
            customText = "{n}";
        }

        final String baseFilename =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");

        List<Integer> pagesToNumberList =
                GeneralUtils.parsePageList(pagesToNumber.split(","), document.getNumberOfPages());

        // Clamp position to 1..9 (1 = top-left, 9 = bottom-right)
        int pos = Math.max(1, Math.min(9, position));

        for (int i : pagesToNumberList) {
            PDPage page = document.getPage(i);
            PDRectangle pageSize = page.getMediaBox();

            String text =
                    customText
                            .replace("{n}", String.valueOf(pageNumber))
                            .replace("{total}", String.valueOf(document.getNumberOfPages()))
                            .replace(
                                    "{filename}",
                                    GeneralUtils.removeExtension(
                                            Filenames.toSimpleFileName(
                                                    file.getOriginalFilename())));

            PDType1Font currentFont =
                    switch (fontType == null ? "" : fontType.toLowerCase(Locale.ROOT)) {
                        case "courier" -> new PDType1Font(Standard14Fonts.FontName.COURIER);
                        case "times" -> new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);
                        default -> new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                    };

            // Text dimensions and font metrics
            float textWidth = currentFont.getStringWidth(text) / 1000f * fontSize;
            float ascent = currentFont.getFontDescriptor().getAscent() / 1000f * fontSize;
            float descent = currentFont.getFontDescriptor().getDescent() / 1000f * fontSize;

            // Derive column/row in range 1..3 (1 = left/top, 2 = center/middle, 3 = right/bottom)
            int col = ((pos - 1) % 3) + 1; // 1 = left, 2 = center, 3 = right
            int row = ((pos - 1) / 3) + 1; // 1 = top, 2 = middle, 3 = bottom

            // Anchor coordinates with margin
            float leftX = pageSize.getLowerLeftX() + marginFactor * pageSize.getWidth();
            float midX = pageSize.getLowerLeftX() + pageSize.getWidth() / 2f;
            float rightX = pageSize.getUpperRightX() - marginFactor * pageSize.getWidth();

            float botY = pageSize.getLowerLeftY() + marginFactor * pageSize.getHeight();
            float midY = pageSize.getLowerLeftY() + pageSize.getHeight() / 2f;
            float topY = pageSize.getUpperRightY() - marginFactor * pageSize.getHeight();

            // Horizontal alignment: left = anchor, center = centered, right = right-aligned
            float x =
                    switch (col) {
                        case 1 -> leftX;
                        case 2 -> midX - textWidth / 2f;
                        default -> rightX - textWidth;
                    };

            // Vertical alignment (baseline!):
            // top    = align text top at topY,
            // middle = optical middle using ascent/descent,
            // bottom = baseline at botY
            float y =
                    switch (row) {
                        case 1 -> topY - ascent;
                        case 2 -> midY - (ascent + descent) / 2f;
                        default -> botY;
                    };

            try (PDPageContentStream contentStream =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                contentStream.beginText();
                contentStream.setFont(currentFont, fontSize);
                contentStream.setNonStrokingColor(color);
                contentStream.newLineAtOffset(x, y);
                contentStream.showText(text);
                contentStream.endText();
            }

            pageNumber++;
        }

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        document.close();

        return WebResponseUtils.bytesToWebResponse(
                baos.toByteArray(),
                GeneralUtils.generateFilename(
                        file.getOriginalFilename(), "_page_numbers_added.pdf"));
    }
}
