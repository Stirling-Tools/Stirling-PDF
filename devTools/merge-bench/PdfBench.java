import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.ValueLayout;
import java.lang.invoke.MethodHandle;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;

import jdk.jfr.Configuration;
import jdk.jfr.Recording;


public class PdfBench {

    public static void main(String[] a) throws Exception {
        switch (a[0]) {
            case "mkbm" -> mkbm(Path.of(a[1]), Path.of(a[2]));
            case "bench" -> bench(a);
            case "profile" -> profile(a);
            case "loop" -> loop(a);
            default -> throw new IllegalArgumentException(a[0]);
        }
        System.exit(0);
    }

    static void bench(String[] a) throws Exception {
        String label = a[1], op = a[2], engine = a[3], type = a[7];
        int conc = Integer.parseInt(a[4]), warmup = Integer.parseInt(a[5]), rounds = Integer.parseInt(a[6]);
        Path file = Path.of(a[8]);
        int copies = Integer.parseInt(a[9]);
        String head = String.join(",", label + "-" + op + "-" + engine + "-" + type + "-" + copies + "-" + conc,
                label, op, type, String.valueOf(copies), String.valueOf(conc), engine);
        PdfOps e = null;
        ExecutorService ex = Executors.newFixedThreadPool(conc, daemon());
        try {
            e = new PdfOps(op, engine, Collections.nCopies(copies, file));
            PdfOps run = e;
            for (int i = 0; i < warmup; i++) runConcurrent(ex, conc, run::once);
            int live = e.liveWorkers();
            resetHeapPeaks();
            long cpu0 = processTreeCpuNanos();
            List<Long> lat = new ArrayList<>();
            long wall = 0;
            for (int r = 0; r < rounds; r++) {
                long w0 = System.nanoTime();
                lat.addAll(runConcurrent(ex, conc, run::once));
                wall += System.nanoTime() - w0;
            }
            long cpu = processTreeCpuNanos() - cpu0;
            Collections.sort(lat);
            int merges = lat.size();
            String status = e.workers > 0 && live < Math.min(e.workers, conc) ? "WORKERS_NOT_LIVE" : "ok";
            System.out.printf("%s,%.6f,%.6f,%.6f,%.3f,%d,%d,%d,%s%n", head,
                    lat.get(merges / 2) / 1e9, lat.get(merges - 1) / 1e9, cpu / 1e9 / merges,
                    (double) cpu / wall, heapPeakMb(), processTreePeakRssMb(), live, status);
        } catch (Throwable ex2) {
            Throwable c = ex2;
            while (c.getCause() != null) c = c.getCause();
            System.out.printf("%s,,,,,,,,FAILED %s%n", head, String.valueOf(c).replaceAll("[,\n\r]", ";"));
        } finally {
            if (e != null) e.close();
        }
    }

    static void profile(String[] a) throws Exception {
        PdfOps e = new PdfOps(a[1], a[2], Collections.nCopies(Integer.parseInt(a[4]), Path.of(a[3])));
        int merges = Integer.parseInt(a[5]);
        for (int i = 0; i < 2; i++) e.once();
        Recording rec = new Recording(Configuration.getConfiguration("profile"));
        rec.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(5));
        rec.enable("jdk.NativeMethodSample").withPeriod(Duration.ofMillis(5));
        rec.enable("jdk.ObjectAllocationInNewTLAB").withStackTrace();
        rec.enable("jdk.ObjectAllocationOutsideTLAB").withStackTrace();
        rec.disable("jdk.ObjectAllocationSample");
        rec.start();
        for (int i = 0; i < merges; i++) e.once();
        rec.stop();
        rec.dump(Path.of(a[6]));
        rec.close();
        System.out.printf("merges=%d peak_rss_mb=%d%n", merges, processTreePeakRssMb());
        e.close();
    }

    static void loop(String[] a) throws Exception {
        PdfOps e = new PdfOps(a[1], a[2], Collections.nCopies(Integer.parseInt(a[4]), Path.of(a[3])));
        boolean timed = a.length > 6 && a[6].equals("s");
        long n = Long.parseLong(a[5]);
        for (int i = 0; i < 2; i++) e.once();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        System.out.println("READY " + ProcessHandle.current().pid());
        System.out.flush();
        in.readLine();
        long done = 0, end = System.nanoTime() + n * 1_000_000_000L;
        while (timed ? System.nanoTime() < end : done < n) {
            e.once();
            done++;
        }
        System.out.println("DONE " + done);
        System.out.flush();
        in.readLine();
        e.close();
    }

    static List<Long> runConcurrent(ExecutorService ex, int conc, Callable<Long> one) throws Exception {
        List<Long> out = new ArrayList<>(conc);
        for (Future<Long> f : ex.invokeAll(Collections.nCopies(conc, one))) out.add(f.get());
        return out;
    }

    static java.util.concurrent.ThreadFactory daemon() {
        return r -> {
            Thread t = new Thread(r, "merge-bench");
            t.setDaemon(true);
            return t;
        };
    }

    static void resetHeapPeaks() {
        System.gc();
        for (MemoryPoolMXBean p : ManagementFactory.getMemoryPoolMXBeans()) {
            if (p.getType() == MemoryType.HEAP) p.resetPeakUsage();
        }
    }

    static long heapPeakMb() {
        long sum = 0;
        for (MemoryPoolMXBean p : ManagementFactory.getMemoryPoolMXBeans()) {
            if (p.getType() == MemoryType.HEAP) sum += p.getPeakUsage().getUsed();
        }
        return sum >> 20;
    }

    static long processTreeCpuNanos() {
        var os = (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
        long sum = os.getProcessCpuTime();
        for (ProcessHandle h : ProcessHandle.current().descendants().toList()) sum += cpuNanos(h);
        return sum;
    }

    static long cpuNanos(ProcessHandle h) {
        if (!MAC) return h.info().totalCpuDuration().map(Duration::toNanos).orElse(0L);
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment buf = rusage(arena, h.pid());
            if (buf == null) return 0L;
            long ticks = buf.get(ValueLayout.JAVA_LONG, RI_USER_TIME) + buf.get(ValueLayout.JAVA_LONG, RI_SYSTEM_TIME);
            return ticks * timebase()[0] / timebase()[1];
        } catch (Throwable t) {
            return 0L;
        }
    }

    private static long[] timebase;

    static long[] timebase() throws Throwable {
        if (timebase == null) {
            Linker linker = Linker.nativeLinker();
            MethodHandle mh = linker.downcallHandle(linker.defaultLookup().find("mach_timebase_info").orElseThrow(),
                    FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS));
            try (Arena arena = Arena.ofConfined()) {
                MemorySegment tb = arena.allocate(8, 4);
                int rc = (int) mh.invokeExact(tb);
                timebase = new long[] {tb.get(ValueLayout.JAVA_INT, 0), tb.get(ValueLayout.JAVA_INT, 4)};
            }
        }
        return timebase;
    }

    static MemorySegment rusage(Arena arena, long pid) throws Throwable {
        if (procPidRusage == null) {
            Linker linker = Linker.nativeLinker();
            procPidRusage = linker.downcallHandle(linker.defaultLookup().find("proc_pid_rusage").orElseThrow(),
                    FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.JAVA_INT, ValueLayout.JAVA_INT, ValueLayout.ADDRESS));
        }
        MemorySegment buf = arena.allocate(512, 8);
        int rc = (int) procPidRusage.invokeExact((int) pid, RUSAGE_INFO_V4, buf);
        return rc == 0 ? buf : null;
    }

    static long processTreePeakRssMb() {
        long sum = peakRssBytes(ProcessHandle.current().pid());
        for (ProcessHandle h : ProcessHandle.current().descendants().toList()) sum += peakRssBytes(h.pid());
        return sum >> 20;
    }

    private static final boolean MAC = System.getProperty("os.name").toLowerCase().contains("mac");
    private static final int RUSAGE_INFO_V4 = 4;
    private static final long RI_USER_TIME = 16;
    private static final long RI_SYSTEM_TIME = 24;
    private static final long RI_LIFETIME_MAX_PHYS_FOOTPRINT = 240;
    private static MethodHandle procPidRusage;

    static long peakRssBytes(long pid) {
        try {
            if (!MAC) {
                return Files.readAllLines(Path.of("/proc/" + pid + "/status")).stream()
                        .filter(l -> l.startsWith("VmHWM"))
                        .map(l -> Long.parseLong(l.replaceAll("[^0-9]", "")) * 1024)
                        .findFirst().orElse(0L);
            }
            try (Arena arena = Arena.ofConfined()) {
                MemorySegment buf = rusage(arena, pid);
                return buf == null ? 0L : buf.get(ValueLayout.JAVA_LONG, RI_LIFETIME_MAX_PHYS_FOOTPRINT);
            }
        } catch (Throwable t) {
            return 0L;
        }
    }

    static void mkbm(Path src, Path dst) throws Exception {
        try (PDDocument d = Loader.loadPDF(src.toFile())) {
            PDDocumentOutline o = new PDDocumentOutline();
            d.getDocumentCatalog().setDocumentOutline(o);
            for (int i = 0; i < d.getNumberOfPages(); i += 10) {
                PDOutlineItem it = new PDOutlineItem();
                it.setTitle("Section " + (i / 10 + 1));
                it.setDestination(d.getPage(i));
                o.addLast(it);
            }
            d.save(dst.toFile());
        }
    }
}
