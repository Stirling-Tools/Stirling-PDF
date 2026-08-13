package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class JpdfiumGuardTest {

    @Test
    void scopeIsExclusiveAcrossThreads() throws Exception {
        int threads = 8;
        int itersPerThread = 200;
        AtomicInteger inside = new AtomicInteger();
        AtomicInteger overlaps = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            futures.add(
                    pool.submit(
                            () -> {
                                start.await();
                                for (int i = 0; i < itersPerThread; i++) {
                                    try (JpdfiumGuard.Scope scope = JpdfiumGuard.acquire()) {
                                        if (inside.incrementAndGet() != 1) {
                                            overlaps.incrementAndGet();
                                        }
                                        Thread.onSpinWait();
                                        inside.decrementAndGet();
                                    }
                                }
                                return null;
                            }));
        }
        start.countDown();
        for (Future<?> f : futures) {
            f.get(60, TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertEquals(0, overlaps.get(), "two threads were inside the jpdfium guard at once");
        assertFalse(JpdfiumGuard.heldByCurrentThread());
    }

    @Test
    void nestedScopesAreReentrantAndReleaseOnlyAtTheOutermost() {
        assertFalse(JpdfiumGuard.heldByCurrentThread());
        try (JpdfiumGuard.Scope outer = JpdfiumGuard.acquire()) {
            assertTrue(JpdfiumGuard.heldByCurrentThread());
            try (JpdfiumGuard.Scope inner = JpdfiumGuard.acquire()) {
                assertTrue(JpdfiumGuard.heldByCurrentThread());
            }
            assertTrue(JpdfiumGuard.heldByCurrentThread(), "inner close released the outer scope");
        }
        assertFalse(JpdfiumGuard.heldByCurrentThread());
    }

    @Test
    @Timeout(30)
    void acquireGivesUpInsteadOfWaitingForever() throws Exception {
        // A wedged holder must not hang every other caller on the process-wide lock.
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder =
                new Thread(
                        () -> {
                            try (JpdfiumGuard.Scope scope = JpdfiumGuard.acquire()) {
                                held.countDown();
                                release.await();
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        });
        holder.start();
        assertTrue(held.await(10, TimeUnit.SECONDS), "holder never took the lock");

        try {
            assertThrows(
                    JpdfiumGuard.JpdfiumBusyException.class,
                    () -> JpdfiumGuard.acquire(Duration.ofMillis(50)));
        } finally {
            release.countDown();
            holder.join(10_000);
        }
        assertFalse(JpdfiumGuard.heldByCurrentThread());
    }

    @Test
    void closingTwiceDoesNotOverRelease() {
        JpdfiumGuard.Scope scope = JpdfiumGuard.acquire();
        scope.close();
        scope.close();
        assertFalse(JpdfiumGuard.heldByCurrentThread());
    }

    /** Calls that hand back a live native document. Each one must sit inside a guard scope. */
    private static final List<String> NATIVE_ENTRY_POINTS =
            List.of(
                    "PdfDocument.open(",
                    "PdfMerge.merge(",
                    "PdfSplit.extractPageRange(",
                    "PdfBookmarkEditor.setBookmarks(");

    /**
     * PDFium is process-global, so a single unguarded entry poisons every other caller. Any new
     * jpdfium entry point has to sit inside a {@link JpdfiumGuard} scope.
     */
    @Test
    void everyProductionNativeEntryPointIsGuarded() throws IOException {
        Path appRoot = locateAppRoot();
        List<String> unguarded = new ArrayList<>();
        try (Stream<Path> files = Files.walk(appRoot)) {
            for (Path p :
                    files.filter(f -> f.toString().endsWith(".java"))
                            .filter(
                                    f ->
                                            f.toString()
                                                    .replace('\\', '/')
                                                    .contains("/src/main/java/"))
                            .toList()) {
                String src = Files.readString(p);
                if (src.contains("JpdfiumGuard")) {
                    continue;
                }
                for (String entry : NATIVE_ENTRY_POINTS) {
                    if (src.contains(entry)) {
                        unguarded.add(appRoot.relativize(p) + " -> " + entry);
                    }
                }
            }
        }
        assertTrue(unguarded.isEmpty(), "jpdfium entry point without a guard scope: " + unguarded);
    }

    private static Path locateAppRoot() {
        Path dir = Path.of("").toAbsolutePath();
        for (int i = 0; i < 6 && dir != null; i++) {
            Path candidate = dir.resolve("app");
            if (Files.isDirectory(candidate.resolve("common").resolve("src"))) {
                return candidate;
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("could not locate the app/ source root");
    }
}
