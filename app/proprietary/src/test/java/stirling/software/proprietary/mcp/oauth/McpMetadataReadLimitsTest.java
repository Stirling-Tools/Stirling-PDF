package stirling.software.proprietary.mcp.oauth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(10)
class McpMetadataReadLimitsTest {
    @Test
    void stalledReadsAreIsolatedAndExcessWorkIsRejectedWithoutQueuing() throws Exception {
        int capacity = McpClientMetadataFetcher.MAX_BODY_READERS;
        CountDownLatch started = new CountDownLatch(capacity);
        List<BlockingBody> bodies = new ArrayList<>();
        List<Future<byte[]>> calls = new ArrayList<>();
        try (var callers =
                Executors.newFixedThreadPool(capacity, Thread.ofPlatform().daemon().factory())) {
            try {
                for (int i = 0; i < capacity; i++) {
                    BlockingBody body = new BlockingBody(started);
                    bodies.add(body);
                    calls.add(
                            callers.submit(
                                    () ->
                                            McpClientMetadataFetcher.readWithDeadline(
                                                    body, Duration.ofSeconds(5))));
                }
                assertTrue(started.await(2, TimeUnit.SECONDS));
                AtomicBoolean overflowClosed = new AtomicBoolean();
                InputStream overflow =
                        new ByteArrayInputStream(new byte[0]) {
                            @Override
                            public void close() {
                                overflowClosed.set(true);
                            }
                        };
                McpOAuthException failure =
                        assertTimeoutPreemptively(
                                Duration.ofSeconds(1),
                                () ->
                                        assertThrows(
                                                McpOAuthException.class,
                                                () ->
                                                        McpClientMetadataFetcher.readWithDeadline(
                                                                overflow, Duration.ofSeconds(5))));
                assertTrue(failure.getMessage().contains("busy"));
                assertTrue(overflowClosed.get());
                for (BlockingBody body : bodies)
                    assertFalse(body.reader.get().startsWith("ForkJoinPool.commonPool"));
            } finally {
                bodies.forEach(BlockingBody::close);
                for (Future<byte[]> call : calls) call.get(2, TimeUnit.SECONDS);
            }
        }
        assertNotNull(
                McpClientMetadataFetcher.readWithDeadline(
                        new ByteArrayInputStream(new byte[0]), Duration.ofSeconds(1)));
    }

    @Test
    void interruptionClosesTheBodyAndRestoresTheCallerInterrupt() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        BlockingBody body = new BlockingBody(started);
        CountDownLatch finished = new CountDownLatch(1);
        AtomicBoolean interrupted = new AtomicBoolean();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread caller =
                Thread.ofPlatform()
                        .daemon()
                        .unstarted(
                                () -> {
                                    try {
                                        McpClientMetadataFetcher.readWithDeadline(
                                                body, Duration.ofSeconds(5));
                                    } catch (Throwable exception) {
                                        failure.set(exception);
                                    } finally {
                                        interrupted.set(Thread.currentThread().isInterrupted());
                                        finished.countDown();
                                    }
                                });
        caller.start();
        try {
            assertTrue(started.await(2, TimeUnit.SECONDS));
            caller.interrupt();
            assertTrue(finished.await(2, TimeUnit.SECONDS));
            assertTrue(body.closed.getCount() == 0);
            assertTrue(interrupted.get());
            assertTrue(failure.get() instanceof McpOAuthException);
        } finally {
            body.close();
            caller.join(2000);
        }
        assertFalse(caller.isAlive());
    }

    private static final class BlockingBody extends InputStream {
        private final CountDownLatch started;
        private final CountDownLatch closed = new CountDownLatch(1);
        private final AtomicReference<String> reader = new AtomicReference<>();

        private BlockingBody(CountDownLatch started) {
            this.started = started;
        }

        @Override
        public int read() throws IOException {
            reader.set(Thread.currentThread().getName());
            started.countDown();
            try {
                closed.await();
                return -1;
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException(exception);
            }
        }

        @Override
        public void close() {
            closed.countDown();
        }
    }
}
