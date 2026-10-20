package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.junit.jupiter.api.Test;

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
}
