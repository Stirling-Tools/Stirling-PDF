package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class SystemFontResolverTest {

    @Test
    void loadsAFaceForEveryCjkAlphabet() throws Exception {
        SystemFontResolver resolver = new SystemFontResolver();
        for (String alphabet : List.of("chinese", "japanese", "korean", "traditional")) {
            try (PDDocument document = new PDDocument()) {
                PDFont font = resolver.loadCjkFont(document, alphabet);
                assertNotNull(font, alphabet);
                assertInstanceOf(PDType0Font.class, font, alphabet);
            }
        }
    }

    @Test
    void koreanFallbackEmbedsModernHangul() throws Exception {
        try (PDDocument document = new PDDocument();
                InputStream input =
                        new ClassPathResource("static/fonts/StirlingSansKR-Regular.ttf")
                                .getInputStream()) {
            PDFont font = PDType0Font.load(document, input);
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(font, 12);
                content.newLineAtOffset(72, 720);
                content.showText("가나다라마바사아자차카타파하");
                content.endText();
            }
            document.save(new ByteArrayOutputStream());
        }
    }
}
