import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.OutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.RandomAccessReadBufferedFile;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.pdf.worker.MergeJob;
import stirling.software.common.pdf.worker.PdfWorkerPool;
import stirling.software.common.util.FormUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.PdfSplit;
import stirling.software.jpdfium.doc.PdfSecurity;
import stirling.software.jpdfium.model.PageSize;
import stirling.software.jpdfium.redact.PdfRedactor;
import stirling.software.jpdfium.redact.RedactOptions;
import stirling.software.jpdfium.redact.RedactResult;
import stirling.software.jpdfium.text.PdfTextExtractor;
import stirling.software.proprietary.pdf.AdvancedPdfMarkdownConverter;

public final class PdfOps implements AutoCloseable {

    static final int SPLIT_PARTS = 10;
    static final int RENDER_MAX_PAGES = 20;
    static final int RENDER_INPUT_SIZE = 1024;
    static final String[] REDACT_TERMS = {"line 7"};
    static final String PASSWORD = "bench";

    final String op, engine;
    final List<Path> inputs;
    final Path file;
    final long totalBytes;
    final int pages;
    final int workers;
    final PdfWorkerPool pool;
    final Path protectionSource;

    PdfOps(String op, String engine, List<Path> inputs) throws Exception {
        this.op = op;
        this.engine = engine;
        this.inputs = inputs;
        this.file = inputs.getFirst();
        this.totalBytes = Files.size(file) * inputs.size();
        try (PDDocument d = Loader.loadPDF(file.toFile())) {
            this.pages = d.getNumberOfPages();
        }
        this.workers = engine.startsWith("pool") ? Integer.parseInt(engine.substring(4)) : 0;
        if (workers > 0) {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().getPdfWorkers().setEnabled("true");
            props.getSystem().getPdfWorkers().setCount(workers);
            pool = new PdfWorkerPool(props);
        } else {
            pool = null;
        }
        protectionSource = op.equals("protect") ? encryptedCopy(file) : null;
    }

    long once() throws Exception {
        Path out = Files.createTempFile("pdf-bench", ".out");
        long t0 = System.nanoTime();
        try {
            switch (op + ":" + engine) {
                case "merge:pdfbox" -> mergePdfbox(out);
                case "merge:jpdfium" -> new MergeJob(inputs, out, null, false).run();
                case "pagecount:pdfbox" -> {
                    try (PDDocument d = Loader.loadPDF(new RandomAccessReadBufferedFile(file.toFile()))) {
                        check(d.getNumberOfPages() == pages);
                    }
                }
                case "pagecount:jpdfium" -> {
                    try (PdfDocument d = PdfDocument.open(file)) {
                        check(d.pageCount() == pages);
                    }
                }
                case "split:pdfbox" -> splitPdfbox(out);
                case "split:jpdfium" -> splitJpdfium(out);
                case "split:jpdfium-file" -> splitJpdfiumFile(out);
                case "splitsize:jpdfium" -> splitBySizeJpdfium(out);
                case "redact:pdfbox" -> redactPdfbox(out);
                case "redact:jpdfium" -> redactJpdfium(out);
                case "text:pdfbox" -> {
                    try (PDDocument d = Loader.loadPDF(new RandomAccessReadBufferedFile(file.toFile()))) {
                        check(!new PDFTextStripper().getText(d).isEmpty());
                    }
                }
                case "text:jpdfium" -> {
                    try (PdfDocument d = PdfDocument.open(file)) {
                        check(PdfTextExtractor.extractAll(d).size() == pages);
                    }
                }
                case "markdown:jpdfium" -> {
                    try (PdfDocument d = PdfDocument.open(file)) {
                        check(!new PdfMarkdownConverter().extractBlocks(d).isEmpty());
                    }
                }
                case "markdown:jpdfium-adv" -> {
                    try (PdfDocument d = PdfDocument.open(file)) {
                        check(!new AdvancedPdfMarkdownConverter().extractBlocks(d).isEmpty());
                    }
                }
                case "render:pdfbox" -> renderPdfbox();
                case "render:jpdfium" -> renderJpdfium();
                case "protect:pdfbox" -> protectPdfbox(out);
                case "protect:jpdfium" -> protectJpdfium(out);
                default -> {
                    if (op.equals("merge") && pool != null) pool.execute(new MergeJob(inputs, out, null, false));
                    else throw new IllegalArgumentException(op + ":" + engine);
                }
            }
            return System.nanoTime() - t0;
        } finally {
            Files.deleteIfExists(out);
        }
    }

    private static void check(boolean ok) {
        if (!ok) throw new IllegalStateException("unexpected output");
    }

    private void mergePdfbox(Path out) throws Exception {
        PDFMergerUtility m = new PDFMergerUtility();
        for (Path x : inputs) m.addSource(x.toFile());
        m.setDestinationFileName(out.toString());
        MemoryUsageSetting s = totalBytes < 10L << 20 ? MemoryUsageSetting.setupMainMemoryOnly()
                : totalBytes < 50L << 20 ? MemoryUsageSetting.setupMixed(10L << 20)
                : MemoryUsageSetting.setupTempFileOnly();
        m.mergeDocuments(() -> new ScratchFile(s));
    }

    private List<int[]> splitRanges() {
        List<int[]> ranges = new ArrayList<>();
        int per = Math.max(1, (pages + SPLIT_PARTS - 1) / SPLIT_PARTS);
        for (int from = 0; from < pages; from += per) ranges.add(new int[] {from, Math.min(pages, from + per) - 1});
        return ranges;
    }

    private void splitJpdfium(Path out) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(out));
                PdfDocument src = PdfDocument.open(file)) {
            int i = 0;
            for (int[] r : splitRanges()) {
                Path part = Files.createTempFile("split", ".pdf");
                try {
                    try (PdfDocument split = PdfSplit.extractPageRange(src, r[0], r[1])) {
                        split.save(part);
                    }
                    zipEntry(zip, ++i, part);
                } finally {
                    Files.deleteIfExists(part);
                }
            }
        }
    }

    private void splitJpdfiumFile(Path out) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(out))) {
            int i = 0;
            for (int[] r : splitRanges()) {
                Path part = Files.createTempFile("split", ".pdf");
                try {
                    Files.delete(part);
                    PdfSplit.extractPageRangeToFile(file, r[0], r[1], part);
                    zipEntry(zip, ++i, part);
                } finally {
                    Files.deleteIfExists(part);
                }
            }
        }
    }

    private void splitPdfbox(Path out) throws Exception {
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(out))) {
            int i = 0;
            for (int[] r : splitRanges()) {
                Set<Integer> keep = new HashSet<>();
                for (int p = r[0]; p <= r[1]; p++) keep.add(p);
                try (PDDocument doc = Loader.loadPDF(file.toFile())) {
                    for (int p = doc.getNumberOfPages() - 1; p >= 0; p--) {
                        if (!keep.contains(p)) doc.removePage(p);
                    }
                    FormUtils.pruneOrphanedFormFields(doc);
                    zip.putNextEntry(new ZipEntry("part_" + (++i) + ".pdf"));
                    doc.save(nonClosing(zip));
                    zip.closeEntry();
                }
            }
        }
    }

    private void splitBySizeJpdfium(Path out) throws Exception {
        long maxBytes = Files.size(file) / 4;
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(out));
                PdfDocument src = PdfDocument.open(file)) {
            Path probe = Files.createTempFile("probe", ".pdf");
            List<int[]> ranges = new ArrayList<>();
            try {
                int total = src.pageCount(), start = 0, end = -1;
                for (int i = 0; i < total; i++) {
                    end = i;
                    int added = end - start + 1;
                    if (!(added % 5 == 0 || i == total - 1 || added >= 20)) continue;
                    long size = saveRange(src, start, end, probe);
                    if (size > maxBytes) {
                        if (added > 1) {
                            end = i - 1;
                            i--;
                        }
                        ranges.add(new int[] {start, end});
                        start = end + 1;
                        end = start - 1;
                    } else if (i < total - 1 && size < maxBytes * 0.75) {
                        int ahead = Math.min(5, total - i - 1), extra = 0;
                        for (int k = 0; k < ahead; k++) {
                            if (saveRange(src, start, i + 1 + k, probe) > maxBytes) break;
                            extra++;
                        }
                        i += extra;
                        end = i;
                    }
                }
                if (end >= start) ranges.add(new int[] {start, end});
            } finally {
                Files.deleteIfExists(probe);
            }
            int n = 0;
            for (int[] r : ranges) {
                Path part = Files.createTempFile("split", ".pdf");
                try {
                    saveRange(src, r[0], r[1], part);
                    zipEntry(zip, ++n, part);
                } finally {
                    Files.deleteIfExists(part);
                }
            }
        }
    }

    private static long saveRange(PdfDocument src, int from, int to, Path out) throws Exception {
        try (PdfDocument split = PdfSplit.extractPageRange(src, from, to)) {
            split.save(out);
        }
        return Files.size(out);
    }

    private static void zipEntry(ZipOutputStream zip, int index, Path part) throws Exception {
        zip.putNextEntry(new ZipEntry("part_" + index + ".pdf"));
        Files.copy(part, zip);
        zip.closeEntry();
    }

    private static OutputStream nonClosing(OutputStream o) {
        return new java.io.FilterOutputStream(o) {
            @Override
            public void write(byte[] b, int off, int len) throws java.io.IOException {
                out.write(b, off, len);
            }

            @Override
            public void close() throws java.io.IOException {
                flush();
            }
        };
    }

    private void redactJpdfium(Path out) throws Exception {
        RedactOptions options = RedactOptions.builder()
                .addWords(List.of(REDACT_TERMS))
                .useRegex(false)
                .wholeWord(true)
                .caseSensitive(false)
                .boxColor(0xFF000000)
                .padding(0f)
                .removeContent(true)
                .convertToImage(false)
                .normalizeFonts(false)
                .fixToUnicode(false)
                .glyphAware(true)
                .ligatureAware(true)
                .bidiAware(true)
                .graphemeSafe(true)
                .sanitizeStructure(false)
                .redactMetadata(true)
                .build();
        try (PdfDocument check = PdfDocument.open(file)) {
            check(check.pageCount() > 0);
        }
        RedactResult result = PdfRedactor.redact(file, options);
        try {
            for (RedactResult.PageResult p : result.pageResults()) check(p.matchesFound() >= 0);
            check(result.totalMatches() > 0);
            result.save(out);
        } finally {
            if (result.document() != null) result.document().close();
        }
    }

    private static final String SECURITY = "stirling.software.SPDF.controller.api.security.";
    private static Object textRedaction, manualRedaction;
    private static Method findText, redactFound;

    @SuppressWarnings("unchecked")
    private void redactPdfbox(Path out) throws Exception {
        if (findText == null) {
            Class<?> trs = Class.forName(SECURITY + "TextRedactionService");
            Constructor<?> c = trs.getDeclaredConstructor();
            c.setAccessible(true);
            textRedaction = c.newInstance();
            findText = trs.getDeclaredMethod("findTextToRedact", PDDocument.class, String[].class, boolean.class, boolean.class, boolean.class);
            findText.setAccessible(true);
            Class<?> mrs = Class.forName(SECURITY + "ManualRedactionService");
            Constructor<?> mc = mrs.getDeclaredConstructors()[0];
            mc.setAccessible(true);
            manualRedaction = mc.newInstance(new Object[mc.getParameterCount()]);
            redactFound = mrs.getDeclaredMethod("redactFoundText", PDDocument.class, List.class, float.class, Color.class, boolean.class);
            redactFound.setAccessible(true);
        }
        try (PDDocument doc = Loader.loadPDF(file.toFile())) {
            Map<Integer, List<?>> found = (Map<Integer, List<?>>) findText.invoke(textRedaction, doc, REDACT_TERMS, false, true, false);
            List<Object> all = new ArrayList<>();
            for (List<?> l : found.values()) all.addAll(l);
            check(!all.isEmpty());
            redactFound.invoke(manualRedaction, doc, all, 0f, Color.BLACK, false);
            doc.save(out.toFile());
        }
    }

    private static int renderDpi(float w, float h) {
        float maxSide = Math.max(w, h);
        int dpi = maxSide <= 0 ? 150 : Math.round(72f * RENDER_INPUT_SIZE / maxSide);
        return Math.max(36, Math.min(300, dpi));
    }

    private void renderJpdfium() throws Exception {
        byte[] bytes = Files.readAllBytes(file);
        try (PdfDocument doc = PdfDocument.open(bytes)) {
            int n = Math.min(RENDER_MAX_PAGES, doc.pageCount());
            for (int i = 0; i < n; i++) {
                try (PdfPage page = doc.page(i)) {
                    PageSize s = page.size();
                    check(page.renderAt(renderDpi(s.width(), s.height())).rgba().length > 0);
                }
            }
        }
    }

    private void renderPdfbox() throws Exception {
        byte[] bytes = Files.readAllBytes(file);
        try (PDDocument doc = Loader.loadPDF(bytes)) {
            PDFRenderer r = new PDFRenderer(doc);
            int n = Math.min(RENDER_MAX_PAGES, doc.getNumberOfPages());
            for (int i = 0; i < n; i++) {
                var box = doc.getPage(i).getMediaBox();
                BufferedImage img = r.renderImageWithDPI(i, renderDpi(box.getWidth(), box.getHeight()), ImageType.ARGB);
                check(img.getWidth() > 0);
            }
        }
    }

    private static Path encryptedCopy(Path src) throws Exception {
        Path out = Files.createTempFile("protect-source", ".pdf");
        try (PDDocument d = Loader.loadPDF(src.toFile())) {
            AccessPermission ap = new AccessPermission();
            ap.setCanModify(false);
            StandardProtectionPolicy policy = new StandardProtectionPolicy(PASSWORD, PASSWORD, ap);
            policy.setEncryptionKeyLength(256);
            d.protect(policy);
            d.save(out.toFile());
        }
        return out;
    }

    private int[] sourceProtection() throws Exception {
        try (PDDocument s = Loader.loadPDF(protectionSource.toFile(), PASSWORD)) {
            check(s.isEncrypted());
            return new int[] {s.getEncryption().getPermissions(), s.getEncryption().getLength(), s.getEncryption().getRevision()};
        }
    }

    private void verifyProtection(Path out, int[] expected) throws Exception {
        try (PDDocument d = Loader.loadPDF(out.toFile(), PASSWORD)) {
            check(d.isEncrypted() && d.getEncryption().getLength() == expected[1]);
        }
    }

    private void protectJpdfium(Path out) throws Exception {
        int[] p = sourceProtection();
        Files.delete(out);
        Method copy;
        try {
            copy = PdfSecurity.class.getMethod("copyEncryption", Path.class, Path.class, Path.class, String.class);
        } catch (NoSuchMethodException e) {
            throw new UnsupportedOperationException("PdfSecurity.copyEncryption is not in this JPDFium build");
        }
        try {
            copy.invoke(null, file, out, protectionSource, PASSWORD);
        } catch (java.lang.reflect.InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
        verifyProtection(out, p);
    }

    private void protectPdfbox(Path out) throws Exception {
        int[] p = sourceProtection();
        try (PDDocument d = Loader.loadPDF(file.toFile())) {
            StandardProtectionPolicy policy = new StandardProtectionPolicy(PASSWORD, PASSWORD, new AccessPermission(p[0]));
            policy.setEncryptionKeyLength(p[1]);
            d.protect(policy);
            d.save(out.toFile());
        }
        verifyProtection(out, p);
    }

    int liveWorkers() throws Exception {
        if (pool == null) return 0;
        var m = PdfWorkerPool.class.getDeclaredMethod("liveWorkers");
        m.setAccessible(true);
        return (int) m.invoke(pool);
    }

    @Override
    public void close() throws Exception {
        if (pool != null) pool.destroy();
        if (protectionSource != null) Files.deleteIfExists(protectionSource);
    }
}
