package stirling.software.SPDF.service.pdfjson.type3.tool;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Gap coverage for Type3SignatureTool - exercises the real PDF scanning path (collectType3Fonts /
 * scanResources / describeFont / verifyOutput) by feeding it a PDF that embeds a Type3 font.
 */
class Type3SignatureToolMoreTest {

    /** Builds a minimal-but-valid Type3 font dictionary with one glyph CharProc. */
    private COSDictionary buildType3FontDict() {
        COSDictionary font = new COSDictionary();
        font.setItem(COSName.TYPE, COSName.FONT);
        font.setItem(COSName.SUBTYPE, COSName.TYPE3);
        font.setString(COSName.BASE_FONT, "ABCDEF+MyType3");

        COSArray matrix = new COSArray();
        for (double v : new double[] {0.001, 0, 0, 0.001, 0, 0}) {
            matrix.add(new org.apache.pdfbox.cos.COSFloat((float) v));
        }
        font.setItem(COSName.FONT_MATRIX, matrix);

        COSArray bbox = new COSArray();
        for (int v : new int[] {0, 0, 750, 750}) {
            bbox.add(org.apache.pdfbox.cos.COSInteger.get(v));
        }
        font.setItem(COSName.FONT_BBOX, bbox);

        font.setInt(COSName.FIRST_CHAR, 65);
        font.setInt(COSName.LAST_CHAR, 65);
        COSArray widths = new COSArray();
        widths.add(org.apache.pdfbox.cos.COSInteger.get(600));
        font.setItem(COSName.WIDTHS, widths);

        // Encoding dictionary mapping code 65 -> "A"
        COSDictionary encoding = new COSDictionary();
        encoding.setItem(COSName.TYPE, COSName.ENCODING);
        COSArray differences = new COSArray();
        differences.add(org.apache.pdfbox.cos.COSInteger.get(65));
        differences.add(COSName.getPDFName("A"));
        encoding.setItem(COSName.DIFFERENCES, differences);
        font.setItem(COSName.ENCODING, encoding);

        // CharProcs with a tiny content stream for glyph "A"
        COSDictionary charProcs = new COSDictionary();
        COSStream glyphStream = new COSStream();
        try (var os = glyphStream.createOutputStream()) {
            os.write("600 0 0 0 750 750 d1\n".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        charProcs.setItem(COSName.getPDFName("A"), glyphStream);
        font.setItem(COSName.CHAR_PROCS, charProcs);

        return font;
    }

    private Path writePdfWithType3(Path dir) throws Exception {
        Path pdf = dir.resolve("type3.pdf");
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            PDResources resources = new PDResources();
            resources.getCOSObject().setItem(COSName.FONT, fontResourceDict());
            page.setResources(resources);
            document.save(pdf.toFile());
        }
        return pdf;
    }

    private COSDictionary fontResourceDict() {
        COSDictionary fonts = new COSDictionary();
        fonts.setItem(COSName.getPDFName("F1"), buildType3FontDict());
        return fonts;
    }

    @Nested
    @DisplayName("real PDF scanning")
    class RealPdfScan {

        @Test
        @DisplayName("writes JSON output file for a PDF containing a Type3 font")
        void main_withType3Pdf_writesOutput(@TempDir Path dir) throws Exception {
            Path pdf = writePdfWithType3(dir);
            Path out = dir.resolve("out.json");

            PrintStream original = System.out;
            ByteArrayOutputStream captured = new ByteArrayOutputStream();
            System.setOut(new PrintStream(captured));
            try {
                Type3SignatureTool.main(
                        new String[] {
                            "--pdf", pdf.toString(), "--output", out.toString(), "--pretty"
                        });
            } finally {
                System.setOut(original);
            }

            assertTrue(Files.exists(out));
            String json = Files.readString(out);
            assertThat(json).contains("\"fonts\"");
            assertThat(json).contains("F1");
            assertThat(json).contains("signature");
            assertThat(captured.toString()).contains("verified");
        }

        @Test
        @DisplayName("writes JSON to stdout when no --output given")
        void main_withType3Pdf_stdout(@TempDir Path dir) throws Exception {
            Path pdf = writePdfWithType3(dir);

            PrintStream original = System.out;
            ByteArrayOutputStream captured = new ByteArrayOutputStream();
            System.setOut(new PrintStream(captured));
            try {
                Type3SignatureTool.main(new String[] {"--pdf", pdf.toString()});
            } finally {
                System.setOut(original);
            }

            String output = captured.toString();
            assertThat(output).contains("fonts");
            assertThat(output).contains("F1");
        }

        @Test
        @DisplayName("output path with nested non-existent parent dirs is created")
        void main_createsParentDirs(@TempDir Path dir) throws Exception {
            Path pdf = writePdfWithType3(dir);
            Path out = dir.resolve("nested/sub/out.json");

            PrintStream original = System.out;
            System.setOut(new PrintStream(new ByteArrayOutputStream()));
            try {
                Type3SignatureTool.main(
                        new String[] {"--pdf", pdf.toString(), "--output", out.toString()});
            } finally {
                System.setOut(original);
            }

            assertTrue(Files.exists(out));
        }

        @Test
        @DisplayName("PDF without Type3 fonts yields empty fonts array")
        void main_noType3Fonts_emptyArray(@TempDir Path dir) throws Exception {
            Path pdf = dir.resolve("plain.pdf");
            try (PDDocument document = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);
                PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    cs.beginText();
                    cs.setFont(font, 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("Hello");
                    cs.endText();
                }
                document.save(pdf.toFile());
            }
            Path out = dir.resolve("plain-out.json");

            PrintStream original = System.out;
            System.setOut(new PrintStream(new ByteArrayOutputStream()));
            try {
                Type3SignatureTool.main(
                        new String[] {"--pdf", pdf.toString(), "--output", out.toString()});
            } finally {
                System.setOut(original);
            }

            String json = Files.readString(out);
            // The shared mapper always indents (INDENT_OUTPUT), so the array is "[ ]".
            assertThat(json).contains("\"fonts\"");
            assertThat(json.replaceAll("\\s", "")).contains("\"fonts\":[]");
        }

        @Test
        @DisplayName("Type3 font nested inside a form XObject is discovered")
        void main_type3InFormXObject(@TempDir Path dir) throws Exception {
            Path pdf = dir.resolve("nested-form.pdf");
            try (PDDocument document = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                document.addPage(page);

                // Build a form XObject whose resources contain the Type3 font.
                COSStream formStream = new COSStream();
                try (var os = formStream.createOutputStream()) {
                    os.write("".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                }
                formStream.setItem(COSName.TYPE, COSName.XOBJECT);
                formStream.setItem(COSName.SUBTYPE, COSName.FORM);
                COSArray formBBox = new COSArray();
                for (int v : new int[] {0, 0, 100, 100}) {
                    formBBox.add(org.apache.pdfbox.cos.COSInteger.get(v));
                }
                formStream.setItem(COSName.BBOX, formBBox);
                COSDictionary formResources = new COSDictionary();
                formResources.setItem(COSName.FONT, fontResourceDict());
                formStream.setItem(COSName.RESOURCES, formResources);

                COSDictionary xobjects = new COSDictionary();
                xobjects.setItem(COSName.getPDFName("Fm0"), formStream);
                PDResources pageResources = new PDResources();
                pageResources.getCOSObject().setItem(COSName.XOBJECT, xobjects);
                page.setResources(pageResources);

                document.save(pdf.toFile());
            }
            Path out = dir.resolve("nested-form-out.json");

            PrintStream original = System.out;
            System.setOut(new PrintStream(new ByteArrayOutputStream()));
            try {
                Type3SignatureTool.main(
                        new String[] {"--pdf", pdf.toString(), "--output", out.toString()});
            } finally {
                System.setOut(original);
            }

            String json = Files.readString(out);
            assertThat(json).contains("F1");
        }
    }
}
