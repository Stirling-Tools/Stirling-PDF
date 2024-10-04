package stirling.software.SPDF.utils.misc;

import java.awt.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.font.*;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.HighContrastColorCombination;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvert;

public class CustomColorReplaceStrategy extends ReplaceAndInvertColorStrategy {

    private String textColor;
    private String backgroundColor;
    private HighContrastColorCombination highContrastColorCombination;

    public CustomColorReplaceStrategy(
            MultipartFile file,
            ReplaceAndInvert replaceAndInvert,
            String textColor,
            String backgroundColor,
            HighContrastColorCombination highContrastColorCombination) {
        super(file, replaceAndInvert);
        this.textColor = textColor;
        this.backgroundColor = backgroundColor;
        this.highContrastColorCombination = highContrastColorCombination;
    }

    @Override
    public InputStreamResource replace() throws IOException {

        // If ReplaceAndInvert is HighContrastColor option, then get the colors of text and
        // background from static
        if (replaceAndInvert == ReplaceAndInvert.HIGH_CONTRAST_COLOR) {
            String[] colors =
                    HighContrastColorReplaceDecider.getColors(
                            replaceAndInvert, highContrastColorCombination);
            this.textColor = colors[0];
            this.backgroundColor = colors[1];
        }

        // Create a temporary file, with the original filename from the multipart file
        File file = File.createTempFile("temp", getFileInput().getOriginalFilename());

        // Transfer the content of the multipart file to the file
        getFileInput().transferTo(file);

        try (PDDocument document = Loader.loadPDF(file)) {

            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {

                PdfTextStripperCustom pdfTextStripperCustom = new PdfTextStripperCustom();
                // Get text positions
                List<List<TextPosition>> charactersByArticle =
                        pdfTextStripperCustom.processPageCustom(page);

                // Begin a new content stream
                PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document, page, PDPageContentStream.AppendMode.APPEND, true, true);

                // Set the new text color
                contentStream.setNonStrokingColor(Color.decode(this.textColor));

                // Draw the text with the new color
                for (List<TextPosition> textPositions : charactersByArticle) {
                    for (TextPosition text : textPositions) {
                        // Move to the text position
                        contentStream.beginText();
                        contentStream.newLineAtOffset(
                                text.getX(), page.getMediaBox().getHeight() - text.getY());
                        PDFont font = null;
                        String unicodeText = text.getUnicode();
                        try {
                            font = PDFontFactory.createFont(text.getFont().getCOSObject());
                        } catch (IOException io) {
                            System.out.println("Primary font not found, using fallback font.");
                            font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                        }
                        // if a character is not supported by font, then look for supported font
                        try {
                            byte[] bytes = font.encode(unicodeText);
                        } catch (IOException io) {
                            System.out.println("text could not be encoded ");
                            font = checkSupportedFontForCharacter(unicodeText);
                        } catch (IllegalArgumentException ie) {
                            System.out.println("text not supported by font ");
                            font = checkSupportedFontForCharacter(unicodeText);
                        } finally {
                            // if any other font is not supported, then replace default character *
                            if (font == null) {
                                font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                                unicodeText = "*";
                            }
                        }
                        contentStream.setFont(font, text.getFontSize());
                        contentStream.showText(unicodeText);
                        contentStream.endText();
                    }
                }
                // Close the content stream
                contentStream.close();
                // Use a content stream to overlay the background color
                try (PDPageContentStream contentStreamBg =
                        new PDPageContentStream(
                                document,
                                page,
                                PDPageContentStream.AppendMode.PREPEND,
                                true,
                                true)) {
                    // Set background color (e.g., light yellow)
                    contentStreamBg.setNonStrokingColor(Color.decode(this.backgroundColor));
                    contentStreamBg.addRect(
                            0, 0, page.getMediaBox().getWidth(), page.getMediaBox().getHeight());
                    contentStreamBg.fill();
                }
            }
            // Save the modified PDF to a ByteArrayOutputStream
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            document.save(byteArrayOutputStream);
            document.close();

            // Prepare the modified PDF for download
            ByteArrayInputStream inputStream =
                    new ByteArrayInputStream(byteArrayOutputStream.toByteArray());
            InputStreamResource resource = new InputStreamResource(inputStream);
            return resource;
        }
    }

    private PDFont checkSupportedFontForCharacter(String unicodeText) {

        Set<String> fonts = Standard14Fonts.getNames();
        for (String font : fonts) {
            Standard14Fonts.FontName fontName = Standard14Fonts.getMappedFontName(font);
            PDFont currentFont = new PDType1Font(fontName);
            try {
                byte[] bytes = currentFont.encode(unicodeText);
                return currentFont;
            } catch (IOException io) {
                System.out.println("text could not be encoded ");
            } catch (IllegalArgumentException ie) {
                System.out.println("text not supported by font ");
            }
        }
        return null;
    }
}
