package stirling.software.SPDF.controller.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;

/**
 * Probe: what can PDFBox actually do for font ENCODING on real-world PDFs. This is a diagnostic
 * test (not a regression) - run with --tests PdfBoxFontEncodingProbeTest -i to see stdout.
 *
 * <p>Answers these questions:
 *
 * <ol>
 *   <li>Type0/CIDFontType2 subset: can we add a new glyph not in the original subset? (no, encode
 *       throws IllegalArgumentException).
 *   <li>Type1: same question.
 *   <li>TrueType: same question.
 *   <li>Can we load a fresh TTF via PDType0Font.load(doc, file) and write text with it? (yes,
 *       primary path).
 *   <li>Round-trip via getFontStream / re-embed - can it rehabilitate Type3? (no - Type3 has no
 *       FontFile* program at all).
 *   <li>What fonts ship with PDFBox / fontbox? (only LiberationSans-Regular.ttf + AFM for the 14
 *       standard fonts; CFF/Type1 binaries are NOT bundled - Standard14Fonts.getMappedFontName
 *       redirects unmappable ones to LiberationSans).
 * </ol>
 */
public class PdfBoxFontEncodingProbeTest {

    private static final Path PROJECT_ROOT =
            Paths.get(System.getProperty("user.dir")).getParent().getParent();

    private static final Path SAMPLE =
            PROJECT_ROOT.resolve("frontend/editor/public/samples/Sample.pdf");

    private static final Path[] EXTRA_FIXTURES = {
        PROJECT_ROOT.resolve("frontend/editor/src/core/tests/test-fixtures/stirling-marketing.pdf"),
        PROJECT_ROOT.resolve("frontend/editor/src/core/tests/test-fixtures/multi-page-sample.pdf"),
        PROJECT_ROOT.resolve("frontend/editor/src/core/tests/test-fixtures/big-sample.pdf"),
        PROJECT_ROOT.resolve("frontend/editor/src/core/tests/test-fixtures/paragraph-sample.pdf"),
        PROJECT_ROOT.resolve("frontend/editor/src/core/tests/test-fixtures/user-sample.pdf"),
    };

    /**
     * Rasterize the Q4b output (Sample.pdf with injected Liberation text) to confirm the new text
     * actually renders on top of the existing Type3 content.
     */
    @Test
    public void probeRenderInjectedSample() throws IOException {
        Path liberation =
                PROJECT_ROOT.resolve(
                        "app/core/src/main/resources/static/fonts/LiberationSans-Regular.ttf");
        byte[] pdfBytes = Files.readAllBytes(SAMPLE);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDPage page = doc.getPage(0);
            PDType0Font ttf;
            try (InputStream in = Files.newInputStream(liberation)) {
                ttf = PDType0Font.load(doc, in, true);
            }
            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            doc, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(ttf, 24);
                cs.newLineAtOffset(50, 120);
                cs.showText("INJECTED via PDType0Font.load - $@#&Z");
                cs.endText();
            }
            doc.save(out);
        }
        // Rasterize page 0 to a PNG so we can eyeball it.
        try (PDDocument check = Loader.loadPDF(out.toByteArray())) {
            PDFRenderer renderer = new PDFRenderer(check);
            java.awt.image.BufferedImage img = renderer.renderImageWithDPI(0, 100);
            Path png = PROJECT_ROOT.resolve("test-screenshots/pdfbox-probe-q4b-rendered.png");
            Files.createDirectories(png.getParent());
            ImageIO.write(img, "PNG", png.toFile());
            System.out.println(
                    "Rendered injected sample to "
                            + png
                            + " - "
                            + img.getWidth()
                            + "x"
                            + img.getHeight());
        }
    }

    /**
     * Build a PDF in memory that uses a Type0/CIDFontType2 subset font (the kind Word / InDesign /
     * LibreOffice produce), then probe whether encode() can add a glyph that wasn't in the original
     * subset.
     */
    @Test
    public void probeType0CIDFontType2Subset() throws IOException {
        System.out.println(
                "\n##################################################################\n"
                        + "Q1 probe: Type0/CIDFontType2 SUBSET can/cannot add new glyphs\n"
                        + "##################################################################\n");
        Path liberation =
                PROJECT_ROOT.resolve(
                        "app/core/src/main/resources/static/fonts/LiberationSans-Regular.ttf");

        // Build a PDF that contains only "abc" subsetted from LiberationSans.
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            PDType0Font subset;
            try (InputStream in = Files.newInputStream(liberation)) {
                subset = PDType0Font.load(doc, in, true /* embedSubset */);
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(subset, 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("abc");
                cs.endText();
            }
            doc.save(baos);
        }

        // Reload the produced PDF and try to add a NEW glyph through the embedded subset font.
        byte[] subsetPdf = baos.toByteArray();
        try (PDDocument doc = Loader.loadPDF(subsetPdf)) {
            PDResources res = doc.getPage(0).getResources();
            for (COSName fn : res.getFontNames()) {
                PDFont f = res.getFont(fn);
                System.out.println(
                        "  Subset font in saved PDF: "
                                + f.getName()
                                + " ("
                                + f.getClass().getSimpleName()
                                + ", subType="
                                + f.getSubType()
                                + ")");
                for (String ch : new String[] {"a", "b", "c", "Z", "z", "0", "$", "@", "X", " "}) {
                    try {
                        byte[] enc = f.encode(ch);
                        StringBuilder hex = new StringBuilder();
                        for (byte b : enc) hex.append(String.format("%02X ", b & 0xff));
                        System.out.println(
                                "    encode('" + ch + "') -> [" + hex.toString().trim() + "] OK");
                    } catch (UnsupportedOperationException uoe) {
                        System.out.println("    encode('" + ch + "') UNSUPPORTED");
                    } catch (IllegalArgumentException iae) {
                        System.out.println(
                                "    encode('" + ch + "') MISSING - " + iae.getMessage());
                    } catch (IOException ioe) {
                        System.out.println("    encode('" + ch + "') IO ERR - " + ioe.getMessage());
                    }
                }
            }
        }
    }

    @Test
    public void probeExtraFixtures() throws IOException {
        System.out.println(
                "\n##################################################################\n"
                        + "Extra fixture font-class probe\n"
                        + "##################################################################\n");
        for (Path fixture : EXTRA_FIXTURES) {
            if (!Files.exists(fixture)) {
                System.out.println("(missing) " + fixture);
                continue;
            }
            System.out.println("\n=== " + fixture.getFileName() + " ===");
            byte[] bytes = Files.readAllBytes(fixture);
            try (PDDocument doc = Loader.loadPDF(bytes)) {
                Set<COSName> seen = new HashSet<>();
                for (int p = 0; p < doc.getNumberOfPages(); p++) {
                    PDPage page = doc.getPage(p);
                    PDResources res = page.getResources();
                    if (res == null) continue;
                    for (COSName name : res.getFontNames()) {
                        if (!seen.add(name)) continue;
                        try {
                            PDFont f = res.getFont(name);
                            if (f == null) continue;
                            String fontFile = "none";
                            PDFontDescriptor d = f.getFontDescriptor();
                            if (d != null) {
                                if (d.getFontFile() != null) fontFile = "FontFile";
                                else if (d.getFontFile2() != null) fontFile = "FontFile2";
                                else if (d.getFontFile3() != null) fontFile = "FontFile3";
                            }
                            String z = "?";
                            try {
                                f.encode("Z");
                                z = "OK";
                            } catch (UnsupportedOperationException ex) {
                                z = "UNSUPPORTED";
                            } catch (IllegalArgumentException ex) {
                                z = "MISSING";
                            } catch (IOException ex) {
                                z = "IO_ERR";
                            }
                            System.out.println(
                                    "  page "
                                            + p
                                            + " "
                                            + name.getName()
                                            + " -> "
                                            + f.getName()
                                            + " "
                                            + f.getClass().getSimpleName()
                                            + " ("
                                            + f.getSubType()
                                            + ", "
                                            + fontFile
                                            + ", embed="
                                            + f.isEmbedded()
                                            + ") encode('Z')="
                                            + z);
                        } catch (IOException e) {
                            System.out.println(
                                    "  page "
                                            + p
                                            + " "
                                            + name.getName()
                                            + " load failed: "
                                            + e.getMessage());
                        }
                    }
                }
            }
        }
    }

    @Test
    public void probeAllQuestions() throws IOException {
        System.out.println(
                "\n##################################################################\n"
                        + "PDFBox font-encoding probe (Sample.pdf + bundled fallback fonts)\n"
                        + "##################################################################\n");

        // Discover every font in Sample.pdf so we have a real-world test set.
        byte[] pdfBytes = Files.readAllBytes(SAMPLE);
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            List<PDFont> allFonts = new ArrayList<>();
            Set<COSName> seen = new HashSet<>();
            for (int p = 0; p < doc.getNumberOfPages(); p++) {
                PDPage page = doc.getPage(p);
                PDResources res = page.getResources();
                if (res == null) continue;
                for (COSName name : res.getFontNames()) {
                    if (!seen.add(name)) continue;
                    try {
                        PDFont f = res.getFont(name);
                        if (f != null) allFonts.add(f);
                    } catch (Exception e) {
                        System.out.println(
                                "  (skipped " + name.getName() + " - " + e.getMessage() + ")");
                    }
                }
            }
            System.out.println(
                    "Discovered " + allFonts.size() + " unique fonts across Sample.pdf:");
            for (PDFont f : allFonts) {
                System.out.println(
                        "  - "
                                + f.getName()
                                + " ("
                                + f.getClass().getSimpleName()
                                + ", subType="
                                + f.getSubType()
                                + ", embedded="
                                + f.isEmbedded()
                                + ")");
            }

            // ------------------ Q1/Q2/Q3 ------------------
            // Try encoding a char that is NEVER in Sample.pdf via each font.
            // 'Z' is unlikely to be in the subset for most marketing pages.
            // Try several candidates to surface what each font can/can't add.
            String[] candidates = {"Z", "$", "@", "#", "Q", "&", "A", "0", "M"};
            for (PDFont f : allFonts) {
                System.out.println("\n=== Encode-probe for font: " + f.getName() + " ===");
                for (String ch : candidates) {
                    try {
                        byte[] enc = f.encode(ch);
                        StringBuilder hex = new StringBuilder();
                        for (byte b : enc) hex.append(String.format("%02X ", b & 0xff));
                        System.out.println(
                                "  encode('" + ch + "') -> [" + hex.toString().trim() + "] OK");
                    } catch (UnsupportedOperationException uoe) {
                        System.out.println(
                                "  encode('" + ch + "') UNSUPPORTED: " + uoe.getMessage());
                    } catch (IllegalArgumentException iae) {
                        System.out.println("  encode('" + ch + "') MISSING: " + iae.getMessage());
                    } catch (IOException ioe) {
                        System.out.println("  encode('" + ch + "') IO ERR: " + ioe.getMessage());
                    }
                }
            }

            // ------------------ Q5 ------------------
            // For each font, see what's in the FontFile* stream - this is what we'd
            // have to round-trip through to "rehabilitate" a Type3 font.
            System.out.println("\n=== FontFile stream availability (Q5) ===");
            for (PDFont f : allFonts) {
                String kind = "none";
                int size = 0;
                PDFontDescriptor d = f.getFontDescriptor();
                if (d != null) {
                    if (d.getFontFile() != null) {
                        kind = "FontFile (Type1)";
                        size = streamBytes(d.getFontFile().getCOSObject().createInputStream());
                    } else if (d.getFontFile2() != null) {
                        kind = "FontFile2 (TTF)";
                        size = streamBytes(d.getFontFile2().getCOSObject().createInputStream());
                    } else if (d.getFontFile3() != null) {
                        kind = "FontFile3 (CFF/OpenType)";
                        size = streamBytes(d.getFontFile3().getCOSObject().createInputStream());
                    }
                }
                System.out.println(
                        "  "
                                + f.getName()
                                + " ("
                                + f.getClass().getSimpleName()
                                + "): "
                                + kind
                                + " ("
                                + size
                                + " bytes)");
                if (f instanceof PDType3Font) {
                    System.out.println(
                            "    -> Type3 has CharProc streams, NOT a FontFile binary."
                                    + " getFontStream() returns null. Round-trip rehab is impossible:");
                    System.out.println(
                            "       each glyph is a mini content stream, not a glyph outline in a"
                                    + " standard font format. We'd need to rasterize each CharProc to"
                                    + " glyph outlines + build a fresh TTF/CFF from scratch.");
                }
            }
        }

        // ------------------ Q4: PDType0Font.load(doc, file) round-trip ------------------
        System.out.println("\n=== Q4: load fresh TTF and write text to a fresh PDF ===");
        Path liberation =
                PROJECT_ROOT.resolve(
                        "app/core/src/main/resources/static/fonts/LiberationSans-Regular.ttf");
        if (!Files.exists(liberation)) {
            System.out.println("  Liberation TTF not found at " + liberation);
        } else {
            try (PDDocument out = new PDDocument()) {
                PDPage page = new PDPage();
                out.addPage(page);
                PDType0Font ttf;
                try (InputStream in = Files.newInputStream(liberation)) {
                    ttf = PDType0Font.load(out, in, true /* embedSubset */);
                }
                System.out.println(
                        "  Loaded TTF -> "
                                + ttf.getName()
                                + " ("
                                + ttf.getClass().getSimpleName()
                                + ")");
                String testText = "Hello world! 0123 Z $ @";
                byte[] encoded = ttf.encode(testText);
                System.out.println(
                        "  Encoded "
                                + testText.length()
                                + " chars -> "
                                + encoded.length
                                + " bytes (Identity-H = 2 bytes/glyph)");
                try (PDPageContentStream cs = new PDPageContentStream(out, page)) {
                    cs.beginText();
                    cs.setFont(ttf, 12);
                    cs.newLineAtOffset(100, 700);
                    cs.showText(testText);
                    cs.endText();
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                out.save(baos);
                Path tmp = Files.createTempFile("pdfbox-probe-q4-", ".pdf");
                Files.write(tmp, baos.toByteArray());
                System.out.println(
                        "  Wrote fresh-TTF PDF to "
                                + tmp
                                + " ("
                                + baos.size()
                                + " bytes) - opens cleanly.");

                // Re-load to confirm the new font is embedded properly.
                try (PDDocument check = Loader.loadPDF(baos.toByteArray())) {
                    PDResources res = check.getPage(0).getResources();
                    for (COSName fn : res.getFontNames()) {
                        PDFont f = res.getFont(fn);
                        System.out.println(
                                "    embedded font: "
                                        + f.getName()
                                        + " ("
                                        + f.getClass().getSimpleName()
                                        + ", embedded="
                                        + f.isEmbedded()
                                        + ")");
                    }
                }
            }
        }

        // ------------------ Q4b: load TTF into an EXISTING PDF (Sample.pdf) and append text ------
        System.out.println(
                "\n=== Q4b: load TTF into EXISTING Sample.pdf and write text on page 0 ===");
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            PDPage page = doc.getPage(0);
            PDType0Font ttf;
            try (InputStream in = Files.newInputStream(liberation)) {
                ttf = PDType0Font.load(doc, in, true);
            }
            // append-mode content stream so we don't disturb existing graphics
            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            doc,
                            page,
                            PDPageContentStream.AppendMode.APPEND,
                            true /* compress */,
                            true /* resetContext */)) {
                cs.beginText();
                cs.setFont(ttf, 12);
                cs.newLineAtOffset(50, 50);
                cs.showText("Injected via PDType0Font.load - $@#&");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            Path tmp = Files.createTempFile("pdfbox-probe-q4b-", ".pdf");
            Files.write(tmp, baos.toByteArray());
            System.out.println(
                    "  Wrote injected-text PDF to " + tmp + " (" + baos.size() + " bytes).");

            // Verify by re-reading: how many fonts now on page 0?
            try (PDDocument check = Loader.loadPDF(baos.toByteArray())) {
                PDResources res = check.getPage(0).getResources();
                int count = 0;
                for (COSName fn : res.getFontNames()) {
                    PDFont f = res.getFont(fn);
                    count++;
                    System.out.println(
                            "    page-0 font: "
                                    + fn.getName()
                                    + " -> "
                                    + f.getName()
                                    + " ("
                                    + f.getClass().getSimpleName()
                                    + ")");
                }
                System.out.println("  Total fonts on page 0: " + count);
            }
        }

        // ------------------ Q6: what fonts ship in PDFBox / fontbox ------------------
        System.out.println("\n=== Q6: bundled fonts (Standard14 redirect probe) ===");
        for (Standard14Fonts.FontName fn : Standard14Fonts.FontName.values()) {
            PDType1Font f = new PDType1Font(fn);
            String mapped = "" + Standard14Fonts.getMappedFontName(fn.getName());
            System.out.println(
                    "  Standard14 "
                            + fn.getName()
                            + " -> mapped='"
                            + mapped
                            + "' name="
                            + f.getName());
        }
        System.out.println(
                "  (PDFBox bundles ONLY LiberationSans-Regular.ttf as a binary; the AFMs cover"
                        + " metrics for the 14 standard fonts but rendering Helvetica/Times/Courier"
                        + " glyphs falls back to LiberationSans glyphs at runtime when no system font"
                        + " is found.)");
    }

    private static int streamBytes(InputStream is) {
        try (InputStream it = is) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = it.read(buf)) >= 0) baos.write(buf, 0, n);
            return baos.size();
        } catch (IOException e) {
            return -1;
        }
    }
}
