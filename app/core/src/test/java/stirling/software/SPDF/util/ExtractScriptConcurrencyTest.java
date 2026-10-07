package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.GeneralUtils;

/**
 * Lives in core because the python resources it extracts ship in this module.
 *
 * <p>Callers hand the returned path straight to python3, so the file has to stay readable while
 * other requests are extracting it. Re-writing it per call used to break that wherever rename is
 * not atomic, such as a 9p or NFS bind mount.
 */
class ExtractScriptConcurrencyTest {

    @Test
    @DisplayName("concurrent callers always get a readable script")
    void concurrentCallersSeeAReadableScript() throws Exception {
        int threads = 16;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger unreadable = new AtomicInteger();
        AtomicInteger errors = new AtomicInteger();

        for (int i = 0; i < threads; i++) {
            Thread.ofVirtual()
                    .start(
                            () -> {
                                try {
                                    start.await();
                                    for (int n = 0; n < 25; n++) {
                                        Path script = GeneralUtils.extractScript("png_to_webp.py");
                                        if (!Files.isReadable(script)) {
                                            unreadable.incrementAndGet();
                                        }
                                    }
                                } catch (Exception e) {
                                    errors.incrementAndGet();
                                } finally {
                                    done.countDown();
                                }
                            });
        }

        start.countDown();
        assertTrue(done.await(60, TimeUnit.SECONDS), "extractScript threads did not finish");
        assertEquals(0, errors.get(), "extractScript threw under concurrency");
        assertEquals(0, unreadable.get(), "script was missing while another caller held it");
    }

    @Test
    @DisplayName("repeated calls return the same path without rewriting the file")
    void repeatedCallsAreStable() throws Exception {
        Path first = GeneralUtils.extractScript("png_to_webp.py");
        long modified = Files.getLastModifiedTime(first).toMillis();
        long size = Files.size(first);

        // Any rewrite after this pause lands on a later timestamp, so mtime is a
        // reliable signal rather than a same-millisecond coin flip.
        Thread.sleep(50);
        for (int i = 0; i < 5; i++) {
            assertEquals(first, GeneralUtils.extractScript("png_to_webp.py"));
        }

        assertEquals(modified, Files.getLastModifiedTime(first).toMillis(), "script was rewritten");
        assertEquals(size, Files.size(first));
    }
}
