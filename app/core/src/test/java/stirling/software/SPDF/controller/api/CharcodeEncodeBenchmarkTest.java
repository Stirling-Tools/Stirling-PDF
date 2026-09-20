package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.pdmodel.font.PDFont;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.controller.api.PdfTextEditorCharcodeController.EncodeCharcodesRequest;
import stirling.software.SPDF.controller.api.PdfTextEditorCharcodeController.EncodeCharcodesResponse;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.jpdfium.text.TextChar;

/**
 * Benchmark: PDFBox encode path vs JPDFium renderer ground truth.
 *
 * <p>For each corpus font the JPDFium text walk reports what PDFium actually renders (unicode +
 * font name per glyph). The same probe alphabet goes through the production {@code
 * encode-charcodes} endpoint (PDFBox {@code font.encode} + ToUnicode reverse map). Two gaps are
 * measured per font:
 *
 * <ul>
 *   <li><b>locate-fail</b>: PDFium renders the font, the endpoint finds no font for it.
 *   <li><b>blind-spot</b>: PDFium renders char C in the font, the endpoint reports C missing.
 * </ul>
 *
 * <p>Both are cases "PDFBox can't, renderer can" - the quantified target for a JPDFium encoding
 * step alongside PDFBox. JPDFium open+extract latency is timed as the cost of adding such a step to
 * the request path.
 */
class CharcodeEncodeBenchmarkTest {

    /** Extra probe chars beyond what the page renders (valid missing outcomes). */
    private static final String PROBE_EXTRAS = "éü中€";

    /** Max fonts per doc and probe chars per font, bounding suite runtime. */
    private static final int MAX_FONTS_PER_DOC = 6;

    private static final int MAX_PROBE_CHARS = 40;

    private PdfTextEditorCharcodeController controller() {
        return new PdfTextEditorCharcodeController(
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class)));
    }

    private static Path repoRoot() {
        Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (dir != null && !Files.exists(dir.resolve("Taskfile.yml"))) {
            dir = dir.getParent();
        }
        return dir;
    }

    private static byte[] fixtureBytes(String name) throws Exception {
        Path root = repoRoot();
        Assumptions.assumeTrue(root != null, "repo root not found");
        Path p = root.resolve("frontend/editor/src/core/tests/test-fixtures").resolve(name);
        Assumptions.assumeTrue(Files.exists(p), "fixture missing: " + p);
        return Files.readAllBytes(p);
    }

    private static byte[] resourceBytes(String name) throws Exception {
        try (InputStream in =
                CharcodeEncodeBenchmarkTest.class.getResourceAsStream("/pdftexteditor/" + name)) {
            assertThat(in).as("test resource " + name).isNotNull();
            return in.readAllBytes();
        }
    }

    /** Rendered chars per font name, most-rendered font first. */
    private static LinkedHashMap<String, LinkedHashSet<String>> renderedByFont(byte[] pdf) {
        LinkedHashMap<String, LinkedHashSet<String>> byFont = new LinkedHashMap<>();
        try (PdfDocument doc = PdfDocument.open(pdf)) {
            if (doc.pageCount() == 0) return byFont;
            PageText page = PdfTextExtractor.extractPage(doc, 0);
            for (TextChar ch : page.chars()) {
                String text = ch.toText();
                if (text == null || text.isEmpty()) continue;
                int cp = text.codePointAt(0);
                if (Character.isWhitespace(cp)) continue;
                byFont.computeIfAbsent(ch.fontName(), k -> new LinkedHashSet<>()).add(text);
            }
        }
        return byFont;
    }

    private static String probeText(Set<String> rendered) {
        StringBuilder sb = new StringBuilder();
        for (String ch : rendered) {
            if (sb.length() >= MAX_PROBE_CHARS) break;
            sb.append(ch);
        }
        for (int i = 0; i < PROBE_EXTRAS.length(); ) {
            int cp = PROBE_EXTRAS.codePointAt(i);
            String one = new String(Character.toChars(cp));
            i += Character.charCount(cp);
            if (!sb.toString().contains(one)) sb.append(one);
        }
        return sb.toString();
    }

    private static String firstLocator(Set<String> rendered) {
        for (String ch : rendered) {
            int cp = ch.codePointAt(0);
            if (Character.isLetterOrDigit(cp)) return ch;
        }
        return rendered.iterator().next();
    }

    private record FontBench(
            String doc,
            String font,
            int renderedChars,
            int probed,
            int encoded,
            int missing,
            int blindSpots,
            boolean located,
            long coldMs,
            long warmMs) {}

    private List<FontBench> benchDoc(String docName, byte[] pdf) throws Exception {
        List<FontBench> out = new ArrayList<>();
        long t0 = System.nanoTime();
        LinkedHashMap<String, LinkedHashSet<String>> byFont = renderedByFont(pdf);
        long extractMs = (System.nanoTime() - t0) / 1_000_000;
        System.out.printf(
                "[bench] %s jpdfium open+extract page0: %dms, %d fonts%n",
                docName, extractMs, byFont.size());

        String b64 = Base64.getEncoder().encodeToString(pdf);
        try (org.apache.pdfbox.pdmodel.PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdf)) {
            org.apache.pdfbox.pdmodel.PDPage page = doc.getPage(0);
            StringBuilder inv = new StringBuilder();
            for (org.apache.pdfbox.cos.COSName name : page.getResources().getFontNames()) {
                try {
                    PDFont f = page.getResources().getFont(name);
                    inv.append(
                            String.format(
                                    "%s=%s/%s ",
                                    name.getName(),
                                    f == null ? "<null>" : f.getName(),
                                    f == null ? "?" : f.getClass().getSimpleName()));
                } catch (Exception ex) {
                    inv.append(name.getName()).append("=<err> ");
                }
            }
            System.out.printf("[bench] FONTS %s : %s%n", docName, inv);
        }
        int n = 0;
        for (Map.Entry<String, LinkedHashSet<String>> e : byFont.entrySet()) {
            if (n++ >= MAX_FONTS_PER_DOC) break;
            String fontName = e.getKey();
            LinkedHashSet<String> rendered = e.getValue();
            String probe = probeText(rendered);

            EncodeCharcodesRequest req = new EncodeCharcodesRequest();
            req.setPdfBase64(b64);
            req.setPageIndex(0);
            req.setLocatorChar(firstLocator(rendered));
            req.setFontName(fontName);
            req.setText(probe);

            long c0 = System.nanoTime();
            ResponseEntity<EncodeCharcodesResponse> cold = controller().encodeCharcodes(req);
            long coldMs = (System.nanoTime() - c0) / 1_000_000;
            long w0 = System.nanoTime();
            ResponseEntity<EncodeCharcodesResponse> warm = controller().encodeCharcodes(req);
            long warmMs = (System.nanoTime() - w0) / 1_000_000;

            EncodeCharcodesResponse body = warm.getBody();
            boolean located = body != null && body.getError() == null;
            int encoded = located && body.getCharcodes() != null ? body.getCharcodes().size() : 0;
            Set<String> missingSet =
                    new LinkedHashSet<>(
                            located && body.getMissing() != null ? body.getMissing() : List.of());
            // Blind spots: rendered by PDFium in this font, reported missing by PDFBox.
            // (Extras the page never rendered are legitimate misses, not blind spots.)
            List<String> blindChars = new ArrayList<>();
            for (String m : missingSet) {
                if (rendered.contains(m)) blindChars.add(m);
            }
            if (!blindChars.isEmpty()) {
                System.out.printf(
                        "[bench] BLIND-SPOTS %s | %s : %s%n",
                        docName, fontName, escapeAll(blindChars));
            }
            // Per-char rescue: the production flow sends one request per font with the
            // locator set to a char OF that font. For anonymous per-glyph Type3 fonts a
            // batched probe lands on the first font only, while locator==char finds each
            // char's own single-glyph font. Measure what that flow rescues.
            int rescued = 0;
            long rescueMs = 0;
            for (String m : blindChars) {
                EncodeCharcodesRequest one = new EncodeCharcodesRequest();
                one.setPdfBase64(b64);
                one.setPageIndex(0);
                one.setLocatorChar(m);
                one.setFontName(fontName);
                one.setText(m);
                long r0 = System.nanoTime();
                ResponseEntity<EncodeCharcodesResponse> r = controller().encodeCharcodes(one);
                rescueMs += (System.nanoTime() - r0) / 1_000_000;
                EncodeCharcodesResponse rb = r.getBody();
                if (rb != null
                        && rb.getError() == null
                        && rb.getCharcodes() != null
                        && rb.getCharcodes().size() == 1) {
                    rescued++;
                }
            }
            if (!blindChars.isEmpty()) {
                System.out.printf(
                        "[bench] RESCUED %s | %s : %d of %d blind chars via per-char locator (%dms)%n",
                        docName, fontName, rescued, blindChars.size(), rescueMs);
            }
            out.add(
                    new FontBench(
                            docName,
                            fontName,
                            rendered.size(),
                            probe.length(),
                            encoded,
                            missingSet.size(),
                            blindChars.size(),
                            located,
                            coldMs,
                            warmMs));
        }
        return out;
    }

    /** Render control chars visible in benchmark output. */
    private static String escapeAll(List<String> chars) {
        StringBuilder sb = new StringBuilder("[");
        for (String ch : chars) {
            int cp = ch.codePointAt(0);
            if (cp < 0x20 || cp == 0x7f) sb.append(String.format("U+%04X", cp));
            else sb.append(ch);
            sb.append(' ');
        }
        return sb.append(']').toString();
    }

    @Test
    void benchmarkCorpus() throws Exception {
        Map<String, byte[]> corpus = new LinkedHashMap<>();
        corpus.put("mushroom-life.pdf", resourceBytes("mushroom-life.pdf"));
        corpus.put("sample.pdf(Type3-Chrome)", fixtureBytes("sample.pdf"));
        corpus.put("subset-font-sample.pdf", fixtureBytes("subset-font-sample.pdf"));
        corpus.put("type3-sample.pdf", fixtureBytes("type3-sample.pdf"));
        corpus.put("user-sample.pdf", fixtureBytes("user-sample.pdf"));
        corpus.put("form-fields-sample.pdf", fixtureBytes("form-fields-sample.pdf"));

        List<FontBench> all = new ArrayList<>();
        for (Map.Entry<String, byte[]> doc : corpus.entrySet()) {
            all.addAll(benchDoc(doc.getKey(), doc.getValue()));
        }

        System.out.println(
                "[bench] doc | font | rendered | probed | encoded | missing | blind | located | coldMs | warmMs");
        int locateFails = 0;
        int blindTotal = 0;
        for (FontBench b : all) {
            System.out.printf(
                    "[bench] %s | %s | %d | %d | %d | %d | %d | %b | %d | %d%n",
                    b.doc(),
                    b.font(),
                    b.renderedChars(),
                    b.probed(),
                    b.encoded(),
                    b.missing(),
                    b.blindSpots(),
                    b.located(),
                    b.coldMs(),
                    b.warmMs());
            if (!b.located()) locateFails++;
            blindTotal += b.blindSpots();
            assertThat(b.coldMs()).as("cold endpoint %s/%s", b.doc(), b.font()).isLessThan(120_000);
            assertThat(b.warmMs()).as("warm endpoint %s/%s", b.doc(), b.font()).isLessThan(60_000);
        }
        System.out.printf(
                "[bench] TOTAL fonts=%d locateFails=%d blindSpots=%d%n",
                all.size(), locateFails, blindTotal);
        assertThat(all).as("benchmark covered fonts").isNotEmpty();
    }
}
