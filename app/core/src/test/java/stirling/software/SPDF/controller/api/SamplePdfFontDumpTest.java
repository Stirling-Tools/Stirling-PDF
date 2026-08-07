package stirling.software.SPDF.controller.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.PDFStreamEngine;
import org.apache.pdfbox.contentstream.operator.state.Concatenate;
import org.apache.pdfbox.contentstream.operator.state.Restore;
import org.apache.pdfbox.contentstream.operator.state.Save;
import org.apache.pdfbox.contentstream.operator.state.SetGraphicsStateParameters;
import org.apache.pdfbox.contentstream.operator.state.SetMatrix;
import org.apache.pdfbox.contentstream.operator.text.BeginText;
import org.apache.pdfbox.contentstream.operator.text.EndText;
import org.apache.pdfbox.contentstream.operator.text.SetFontAndSize;
import org.apache.pdfbox.contentstream.operator.text.SetTextHorizontalScaling;
import org.apache.pdfbox.contentstream.operator.text.SetTextLeading;
import org.apache.pdfbox.contentstream.operator.text.SetTextRenderingMode;
import org.apache.pdfbox.contentstream.operator.text.SetTextRise;
import org.apache.pdfbox.contentstream.operator.text.SetWordSpacing;
import org.apache.pdfbox.contentstream.operator.text.ShowText;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDType3CharProc;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.junit.jupiter.api.Test;

/**
 * Diagnostic test: enumerate every font referenced by Sample.pdf and dump its subtype, encoding,
 * ToUnicode, and embedded font program info. For Type3 fonts also dump CharProcs glyph names and
 * the content stream of one glyph (the 'M' if present).
 *
 * <p>Not a real regression test - run with --tests SamplePdfFontDumpTest -i to see the stdout
 * output.
 */
public class SamplePdfFontDumpTest {

    private static final Path SAMPLE =
            Paths.get(System.getProperty("user.dir"))
                    .getParent()
                    .getParent()
                    .resolve("frontend/editor/public/samples/Sample.pdf");

    @Test
    public void dumpFonts() throws IOException {
        byte[] pdfBytes = Files.readAllBytes(SAMPLE);
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            int numPages = doc.getNumberOfPages();
            System.out.println("Sample.pdf has " + numPages + " pages.");
            Set<COSDictionary> seenFontDicts = new HashSet<>();
            for (int p = 0; p < numPages; p++) {
                PDPage page = doc.getPage(p);
                System.out.println("\n=== Page " + p + " ===");
                PDResources resources = page.getResources();
                if (resources == null) {
                    System.out.println("  (no resources)");
                    continue;
                }
                for (COSName fontName : resources.getFontNames()) {
                    PDFont font;
                    try {
                        font = resources.getFont(fontName);
                    } catch (IOException e) {
                        System.out.println(
                                "  Font "
                                        + fontName.getName()
                                        + ": failed to load - "
                                        + e.getMessage());
                        continue;
                    }
                    if (font == null) continue;
                    COSDictionary dict = font.getCOSObject();
                    if (!seenFontDicts.add(dict)) {
                        System.out.println(
                                "  Font " + fontName.getName() + " -> already seen above");
                        continue;
                    }
                    dumpFont(fontName.getName(), font);
                }
            }
            // Scan: for every text-show operation, record per-font (charcode, unicode) pairs.
            System.out.println("\n=== All (font, charcode, unicode) seen on page ===");
            for (int p = 0; p < numPages; p++) {
                PDPage page = doc.getPage(p);
                AllCharsScanner scanner = new AllCharsScanner();
                scanner.processPage(page);
                System.out.println("\nPage " + p + ":");
                for (var entry : scanner.perFont.entrySet()) {
                    PDFont font = entry.getKey();
                    var seen = entry.getValue();
                    System.out.println("  Font " + font.getName() + " " + font.getSubType() + ":");
                    var sortedSeen = new java.util.TreeMap<Integer, String>(seen);
                    for (var s : sortedSeen.entrySet()) {
                        System.out.println(
                                "    charcode 0x"
                                        + Integer.toHexString(s.getKey())
                                        + " ("
                                        + s.getKey()
                                        + ") -> '"
                                        + s.getValue()
                                        + "'");
                    }
                }
            }

            // Confirm font.encode() works for Type3 fonts.
            System.out.println("\n=== Can we encode existing chars in F27/F28? ===");
            PDPage page0 = doc.getPage(0);
            PDResources r0 = page0.getResources();
            for (String fname : new String[] {"F27", "F28"}) {
                PDFont f = r0.getFont(COSName.getPDFName(fname));
                if (f == null) {
                    System.out.println("  " + fname + ": NOT FOUND on page 0");
                    continue;
                }
                System.out.println("  " + fname + ": " + f.getClass().getSimpleName());
                for (String ch : new String[] {"M", "0", "1", "+", "Z", "a"}) {
                    try {
                        byte[] enc = f.encode(ch);
                        StringBuilder sb = new StringBuilder();
                        for (byte b : enc) sb.append(String.format("%02X ", b & 0xff));
                        System.out.println(
                                "    encode('" + ch + "') -> [" + sb.toString().trim() + "]");
                    } catch (Exception e) {
                        System.out.println(
                                "    encode('"
                                        + ch
                                        + "') FAILED: "
                                        + e.getClass().getSimpleName()
                                        + " "
                                        + e.getMessage());
                    }
                }
            }

            // Dump page 0 content stream so we can see how "10M+" is composed.
            System.out.println("\n=== Page 0 RAW content stream (first 4kb) ===");
            try (InputStream is = doc.getPage(0).getContents()) {
                byte[] bytes = is.readAllBytes();
                System.out.println("Total content stream size: " + bytes.length + " bytes");
                String asStr = new String(bytes, StandardCharsets.ISO_8859_1);
                int idx = asStr.indexOf("F27");
                if (idx >= 0) {
                    int start = Math.max(0, idx - 100);
                    int end = Math.min(asStr.length(), idx + 2500);
                    System.out.println("--- F27 context ---");
                    System.out.println(asStr.substring(start, end));
                    System.out.println("---");
                }
                int idx2 = asStr.indexOf("F28");
                if (idx2 >= 0) {
                    int start = Math.max(0, idx2 - 200);
                    int end = Math.min(asStr.length(), idx2 + 600);
                    System.out.println("--- F28 context ---");
                    System.out.println(asStr.substring(start, end));
                    System.out.println("---");
                }
            }

            // Dump a CharProc for each font's first non-zero glyph, with focus on any 'M' or "0".
            System.out.println("\n=== Sample CharProc dumps for Type3 fonts ===");
            Set<COSDictionary> printed = new HashSet<>();
            for (int p = 0; p < numPages; p++) {
                PDPage page = doc.getPage(p);
                PDResources resources = page.getResources();
                if (resources == null) continue;
                for (COSName fn : resources.getFontNames()) {
                    PDFont font = resources.getFont(fn);
                    if (!(font instanceof PDType3Font)) continue;
                    if (!printed.add(font.getCOSObject())) continue;
                    PDType3Font t3 = (PDType3Font) font;
                    // Iterate charcodes 0..255 looking for any that map to 'M' or '0' or '+'.
                    for (int cc = 0; cc < 256; cc++) {
                        String u = null;
                        try {
                            u = t3.toUnicode(cc);
                        } catch (Exception e) {
                            /* */
                        }
                        if (u == null) continue;
                        if (u.equals("M") || u.equals("0") || u.equals("+") || u.equals("1")) {
                            System.out.println(
                                    "Page "
                                            + p
                                            + " font '"
                                            + fn.getName()
                                            + "' charcode "
                                            + cc
                                            + " maps to '"
                                            + u
                                            + "':");
                            dumpType3Glyph(t3, cc);
                        }
                    }
                }
            }
        }
    }

    private void dumpFont(String resourceName, PDFont font) {
        COSDictionary dict = font.getCOSObject();
        String subtype = dict.getNameAsString(COSName.SUBTYPE);
        String baseFont = dict.getNameAsString(COSName.BASE_FONT);
        boolean hasEncoding = dict.containsKey(COSName.ENCODING);
        boolean hasToUnicode = dict.containsKey(COSName.TO_UNICODE);
        PDFontDescriptor descriptor = font.getFontDescriptor();
        boolean hasEmbedded = false;
        String embeddedKind = "none";
        if (descriptor != null) {
            COSDictionary dDict = descriptor.getCOSObject();
            if (dDict.containsKey(COSName.FONT_FILE)) {
                hasEmbedded = true;
                embeddedKind = "FontFile (Type1)";
            } else if (dDict.containsKey(COSName.FONT_FILE2)) {
                hasEmbedded = true;
                embeddedKind = "FontFile2 (TrueType)";
            } else if (dDict.containsKey(COSName.FONT_FILE3)) {
                hasEmbedded = true;
                COSBase ff3 = dDict.getDictionaryObject(COSName.FONT_FILE3);
                if (ff3 instanceof COSStream) {
                    String ff3Subtype = ((COSStream) ff3).getNameAsString(COSName.SUBTYPE);
                    embeddedKind = "FontFile3 (" + ff3Subtype + ")";
                } else {
                    embeddedKind = "FontFile3";
                }
            }
        }
        System.out.println(
                "  Font resource '"
                        + resourceName
                        + "': base='"
                        + baseFont
                        + "' subtype="
                        + subtype
                        + " hasEncoding="
                        + hasEncoding
                        + " hasToUnicode="
                        + hasToUnicode
                        + " embedded="
                        + hasEmbedded
                        + " ("
                        + embeddedKind
                        + ")");

        if (font instanceof PDType3Font) {
            PDType3Font t3 = (PDType3Font) font;
            COSDictionary charProcs = t3.getCharProcs();
            int count = charProcs == null ? 0 : charProcs.size();
            System.out.println("    Type3 CharProcs count = " + count);
            if (charProcs != null) {
                TreeSet<String> names = new TreeSet<>();
                for (COSName k : charProcs.keySet()) names.add(k.getName());
                System.out.println("    glyph names: " + names);
            }
        }
    }

    private void dumpType3Glyph(PDType3Font font, int charcode) throws IOException {
        String name = font.getEncoding() != null ? font.getEncoding().getName(charcode) : null;
        System.out.println("  Type3 charcode " + charcode + " -> glyph name '" + name + "'");
        PDType3CharProc proc = font.getCharProc(charcode);
        if (proc == null) {
            System.out.println("    (no CharProc for that charcode)");
            return;
        }
        COSStream stream = proc.getCOSObject();
        byte[] raw;
        try (InputStream is = stream.createInputStream()) {
            raw = is.readAllBytes();
        }
        System.out.println("    CharProc content stream (" + raw.length + " bytes):");
        System.out.println("---");
        System.out.println(new String(raw, StandardCharsets.ISO_8859_1));
        System.out.println("---");
    }

    /** Records every (font, charcode -> unicode) tuple seen on a page. */
    static final class AllCharsScanner extends PDFStreamEngine {
        final java.util.LinkedHashMap<PDFont, java.util.Map<Integer, String>> perFont =
                new java.util.LinkedHashMap<>();

        AllCharsScanner() {
            addOperator(new BeginText(this));
            addOperator(new EndText(this));
            addOperator(new SetFontAndSize(this));
            addOperator(new SetTextHorizontalScaling(this));
            addOperator(new SetTextLeading(this));
            addOperator(new SetTextRenderingMode(this));
            addOperator(new SetTextRise(this));
            addOperator(new SetWordSpacing(this));
            addOperator(new SetMatrix(this));
            addOperator(new Save(this));
            addOperator(new Restore(this));
            addOperator(new Concatenate(this));
            addOperator(new SetGraphicsStateParameters(this));
            addOperator(new ShowText(this));
        }

        @Override
        protected void showText(byte[] string) throws IOException {
            PDFont font = getGraphicsState().getTextState().getFont();
            if (font == null) return;
            var seen = perFont.computeIfAbsent(font, k -> new java.util.LinkedHashMap<>());
            ByteArrayInputStream in = new ByteArrayInputStream(string);
            while (in.available() > 0) {
                int code;
                try {
                    code = font.readCode(in);
                } catch (IOException e) {
                    break;
                }
                String u;
                try {
                    u = font.toUnicode(code);
                } catch (RuntimeException e) {
                    u = null;
                }
                seen.putIfAbsent(code, u);
            }
        }
    }
}
