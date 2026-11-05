import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.io.ScratchFile;
import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.*;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.pdf.worker.MergeJob;
import stirling.software.common.pdf.worker.PdfWorkerPool;

// usage: Bench4 <label> <pdfbox|jpdfium|pool2|pool4> <conc> <rounds> <file> <copies> | Bench4 mkbm <in> <out>
public class Bench4 {
    public static void main(String[] a) throws Exception {
        if (a[0].equals("mkbm")) { mkbm(Path.of(a[1]), Path.of(a[2])); System.exit(0); }
        String label = a[0], mode = a[1]; int conc = Integer.parseInt(a[2]); int rounds = Integer.parseInt(a[3]);
        Path file = Path.of(a[4]); int copies = Integer.parseInt(a[5]);
        List<Path> in = Collections.nCopies(copies, file);
        long total = Files.size(file) * copies;
        int want = mode.startsWith("pool") ? Integer.parseInt(mode.substring(4)) : 0;
        PdfWorkerPool pool = null;
        if (want > 0) {
            ApplicationProperties props = new ApplicationProperties();
            props.getSystem().getPdfWorkers().setEnabled("true");
            props.getSystem().getPdfWorkers().setCount(want);
            pool = new PdfWorkerPool(props);
        }
        PdfWorkerPool p = pool;
        Callable<Long> one = () -> {
            Path out = Files.createTempFile("o", ".pdf");
            long t0 = System.nanoTime();
            switch (mode) {
                case "pdfbox" -> {
                    PDFMergerUtility m = new PDFMergerUtility();
                    for (Path x : in) m.addSource(x.toFile());
                    m.setDestinationFileName(out.toString());
                    MemoryUsageSetting s = total < 10L << 20 ? MemoryUsageSetting.setupMainMemoryOnly()
                        : total < 50L << 20 ? MemoryUsageSetting.setupMixed(10L << 20) : MemoryUsageSetting.setupTempFileOnly();
                    m.mergeDocuments(() -> new ScratchFile(s));
                }
                case "jpdfium" -> new MergeJob(in, out, null, false).run();
                default -> p.execute(new MergeJob(in, out, null, false));
            }
            long ms = (System.nanoTime() - t0) / 1_000_000;
            Files.delete(out);
            return ms;
        };
        ExecutorService ex = Executors.newFixedThreadPool(conc, r -> { Thread t = new Thread(r); t.setDaemon(true); return t; });
        String head = String.format("%s,%s,%d,%s,%d", label, mode, conc, file.getFileName().toString().replace("1.pdf", ""), copies);
        try {
            for (Future<Long> f : ex.invokeAll(Collections.nCopies(conc, one))) f.get();
            int live = pool == null ? 0 : live(pool);
            List<Long> lat = new ArrayList<>(); long wallSum = 0;
            for (int r = 0; r < rounds; r++) {
                long w0 = System.nanoTime();
                for (Future<Long> f : ex.invokeAll(Collections.nCopies(conc, one))) lat.add(f.get());
                wallSum += (System.nanoTime() - w0) / 1_000_000;
            }
            Collections.sort(lat);
            long self = hwm(ProcessHandle.current().pid()), kids = 0;
            for (ProcessHandle h : ProcessHandle.current().descendants().toList()) kids += hwm(h.pid());
            String status = want > 0 && live < Math.min(want, conc) ? "WORKERS_NOT_LIVE" : "ok";
            System.out.printf("%s,%d,%d,%d,%d,%d,%d,%s%n", head, lat.get(lat.size() / 2), lat.get(lat.size() - 1),
                wallSum / rounds, self, self + kids, live, status);
        } catch (Exception e) {
            Throwable c = e; while (c.getCause() != null) c = c.getCause();
            System.out.printf("%s,,,,,,,FAILED %s%n", head, String.valueOf(c).replaceAll("[,\n\r]", ";"));
        }
        if (pool != null) pool.destroy();
        System.exit(0);
    }
    static void mkbm(Path src, Path dst) throws Exception {
        try (PDDocument d = Loader.loadPDF(src.toFile())) {
            PDDocumentOutline o = new PDDocumentOutline(); d.getDocumentCatalog().setDocumentOutline(o);
            for (int i = 0; i < d.getNumberOfPages(); i += 10) {
                PDOutlineItem it = new PDOutlineItem(); it.setTitle("Section " + (i / 10 + 1)); it.setDestination(d.getPage(i)); o.addLast(it);
            }
            d.save(dst.toFile());
        }
    }
    static int live(PdfWorkerPool p) throws Exception { var m = PdfWorkerPool.class.getDeclaredMethod("liveWorkers"); m.setAccessible(true); return (int) m.invoke(p); }
    static long hwm(long pid) {
        try { return Files.readAllLines(Path.of("/proc/" + pid + "/status")).stream().filter(l -> l.startsWith("VmHWM"))
            .map(l -> Long.parseLong(l.replaceAll("[^0-9]", "")) / 1024).findFirst().orElse(0L); } catch (Exception e) { return 0; }
    }
}
