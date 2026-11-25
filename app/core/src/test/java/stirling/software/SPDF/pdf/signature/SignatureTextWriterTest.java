package stirling.software.SPDF.pdf.signature;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.util.Set;
import java.util.TreeSet;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class SignatureTextWriterTest {

    private record Rendered(byte[] pdf, String text, Set<String> faces) {}

    private static Rendered render(String line) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            SignatureTextWriter writer = new SignatureTextWriter(document);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.newLineAtOffset(50, 700);
                writer.showText(stream, line, 10);
                stream.endText();
            }
            document.save(out);
        }
        byte[] pdf = out.toByteArray();
        try (PDDocument reloaded = Loader.loadPDF(pdf)) {
            PDResources resources = reloaded.getPage(0).getResources();
            Set<String> faces = new TreeSet<>();
            for (COSName name : resources.getFontNames()) {
                String baseName = resources.getFont(name).getName();
                faces.add(baseName.substring(baseName.indexOf('+') + 1));
            }
            return new Rendered(pdf, new PDFTextStripper().getText(reloaded).strip(), faces);
        }
    }

    @Test
    void latinUsesOnlyTheBoldFaceAndStaysSmall() throws Exception {
        Rendered rendered = render("Signed by Anthony Stirling");
        assertEquals("Signed by Anthony Stirling", rendered.text());
        assertEquals(Set.of("NotoSans-Bold"), rendered.faces());
        assertTrue(rendered.pdf().length < 100_000, "length " + rendered.pdf().length);
    }

    @Test
    void cyrillicAndGreekStayInTheBoldFace() throws Exception {
        Rendered rendered = render("Signed by Иван Петров Σωκράτης");
        assertEquals("Signed by Иван Петров Σωκράτης", rendered.text());
        assertEquals(Set.of("NotoSans-Bold"), rendered.faces());
    }

    @Test
    void cjkNameMixesFacesAndEmbedsOnlyASubset() throws Exception {
        Rendered rendered = render("Signed by 山田 太郎");
        assertEquals("Signed by 山田 太郎", rendered.text());
        assertTrue(rendered.faces().contains("NotoSans-Bold"), rendered.faces().toString());
        assertTrue(
                rendered.faces().stream().anyMatch(face -> face.startsWith("NotoSansSC")),
                rendered.faces().toString());
        assertTrue(rendered.pdf().length < 500_000, "length " + rendered.pdf().length);
    }

    @Test
    void hangulAndArabicUseTheirScriptFaces() throws Exception {
        Rendered rendered = render("홍길동 محمد");
        assertTrue(
                rendered.faces().stream().anyMatch(face -> face.startsWith("NotoSansKR")),
                rendered.faces().toString());
        assertTrue(
                rendered.faces().stream().anyMatch(face -> face.startsWith("NotoSansArabic")),
                rendered.faces().toString());
    }

    @Test
    void aCharacterNoFaceCoversIsDrawnAsAQuestionMark() throws Exception {
        Rendered rendered = render("Signed by 😀");
        assertEquals("Signed by ?", rendered.text());
    }
}
