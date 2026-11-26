package stirling.software.common.pdf.worker;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.Closeable;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import lombok.extern.slf4j.Slf4j;

/**
 * One live worker process, running up to {@link #capacity()} jobs at once. A reader thread matches
 * responses to jobs by id; when the process dies or breaks protocol, every job in flight on it
 * fails with {@link PdfWorkerDiedException}.
 */
@Slf4j
final class PdfWorkerProcess implements Closeable {

    private final int id;
    private final Process process;
    private final DataOutputStream toWorker;
    private final DataInputStream fromWorker;
    private final int capacity;
    private final Map<Integer, CompletableFuture<PdfWorkerProtocol.Response>> pending =
            new ConcurrentHashMap<>();
    private final AtomicInteger nextJobId = new AtomicInteger(PdfWorkerProtocol.READY_JOB_ID + 1);
    private final AtomicInteger inFlight = new AtomicInteger();
    private final AtomicInteger jobs = new AtomicInteger();
    private volatile long lastUsedNanos = System.nanoTime();
    private volatile boolean draining;
    private volatile String brokenReason;

    private PdfWorkerProcess(
            int id,
            Process process,
            DataOutputStream toWorker,
            DataInputStream fromWorker,
            int capacity) {
        this.id = id;
        this.process = process;
        this.toWorker = toWorker;
        this.fromWorker = fromWorker;
        this.capacity = capacity;
    }

    static PdfWorkerProcess start(
            int id,
            List<String> command,
            int instances,
            Duration startTimeout,
            ScheduledExecutorService timer)
            throws IOException {
        // An argfile keeps long classpaths under the Windows command-line limit.
        Path argFile = Files.createTempFile("stirling-pdf-worker-", ".args");
        Files.write(
                argFile,
                command.subList(1, command.size()).stream().map(PdfWorkerLauncher::quote).toList(),
                StandardCharsets.UTF_8);
        try {
            return launch(
                    id, List.of(command.getFirst(), "@" + argFile), instances, startTimeout, timer);
        } finally {
            // The JVM has read the argfile once it reports ready (or has failed).
            Files.deleteIfExists(argFile);
        }
    }

    private static PdfWorkerProcess launch(
            int id,
            List<String> command,
            int instances,
            Duration startTimeout,
            ScheduledExecutorService timer)
            throws IOException {
        ProcessBuilder builder = new ProcessBuilder(command);
        // These would inject the server's own JVM flags (heap, AOT cache) into the worker.
        builder.environment().remove("JAVA_TOOL_OPTIONS");
        builder.environment().remove("JDK_JAVA_OPTIONS");
        builder.environment().remove("_JAVA_OPTIONS");
        // A system library path would win over the bundle's own: instance 0 would load the host's
        // FreeType, ICU and zlib while isolated instances load the bundled ones.
        builder.environment().remove("LD_LIBRARY_PATH");
        // Each instance allocates through glibc in the bridge; two arenas for all of them contend.
        builder.environment().put("MALLOC_ARENA_MAX", String.valueOf(Math.max(2, 2 * instances)));
        builder.redirectError(ProcessBuilder.Redirect.INHERIT);
        long started = System.nanoTime();
        Process process = builder.start();
        preferAsOomVictim(process);
        DataOutputStream toWorker =
                new DataOutputStream(
                        new BufferedOutputStream(process.getOutputStream(), 64 * 1024));
        DataInputStream fromWorker =
                new DataInputStream(new BufferedInputStream(process.getInputStream(), 64 * 1024));
        AtomicBoolean timedOut = new AtomicBoolean();
        ScheduledFuture<?> kill =
                timer.schedule(
                        () -> {
                            timedOut.set(true);
                            process.destroyForcibly();
                        },
                        startTimeout.toMillis(),
                        TimeUnit.MILLISECONDS);
        int capacity;
        try {
            capacity = PdfWorkerProtocol.capacityOf(PdfWorkerProtocol.readResponse(fromWorker));
        } catch (IOException e) {
            process.destroyForcibly();
            throw new IOException(
                    timedOut.get()
                            ? "PDF worker did not start within " + startTimeout.toSeconds() + "s"
                            : "PDF worker failed to start: " + e.getMessage(),
                    e);
        } finally {
            kill.cancel(false);
        }
        PdfWorkerProcess worker = new PdfWorkerProcess(id, process, toWorker, fromWorker, capacity);
        Thread reader = new Thread(worker::readResponses, "pdf-worker-" + id + "-reader");
        reader.setDaemon(true);
        reader.start();
        log.info(
                "Started PDF worker {} (pid {}, {} PDFium instance{}) in {} ms",
                id,
                process.pid(),
                capacity,
                capacity == 1 ? "" : "s",
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return worker;
    }

    // When memory runs out the kernel kills the process with the highest score; a worker must go
    // before the server. Raising a child's score needs no privilege; elsewhere this is a no-op.
    private static void preferAsOomVictim(Process process) {
        Path score = Path.of("/proc", String.valueOf(process.pid()), "oom_score_adj");
        if (!Files.isWritable(score)) {
            return;
        }
        try {
            Files.writeString(score, "1000");
        } catch (IOException e) {
            log.debug("Could not raise the OOM score of PDF worker pid {}", process.pid(), e);
        }
    }

    /**
     * Sends a job. The future completes with the worker's response, or fails with {@link
     * PdfWorkerDiedException} if the worker goes away first. The caller must have called {@link
     * #reserve()} first and calls {@link #finished()} once done with the job, whatever the outcome.
     */
    CompletableFuture<PdfWorkerProtocol.Response> submit(String type, byte[] request)
            throws PdfWorkerDiedException {
        CompletableFuture<PdfWorkerProtocol.Response> future = new CompletableFuture<>();
        String broken = brokenReason;
        if (broken != null) {
            throw new PdfWorkerDiedException(broken);
        }
        int jobId = nextJobId.getAndIncrement();
        pending.put(jobId, future);
        try {
            synchronized (toWorker) {
                PdfWorkerProtocol.writeRequest(
                        toWorker, new PdfWorkerProtocol.Request(jobId, type, request));
                toWorker.flush();
            }
        } catch (IOException e) {
            fail("Could not send the job to PDF worker " + id + ": " + e.getMessage());
        }
        // fail() may have raced the put; the future is then already completed exceptionally.
        String after = brokenReason;
        if (after != null && pending.remove(jobId) != null) {
            future.completeExceptionally(new PdfWorkerDiedException(after));
        }
        return future;
    }

    /** Counts a job against this worker before it is sent; pair with {@link #finished()}. */
    void reserve() {
        inFlight.incrementAndGet();
        jobs.incrementAndGet();
        lastUsedNanos = System.nanoTime();
    }

    void finished() {
        inFlight.decrementAndGet();
        lastUsedNanos = System.nanoTime();
    }

    private void readResponses() {
        try {
            while (true) {
                PdfWorkerProtocol.Response response = PdfWorkerProtocol.readResponse(fromWorker);
                CompletableFuture<PdfWorkerProtocol.Response> future =
                        pending.remove(response.jobId());
                if (future == null) {
                    fail("PDF worker " + id + " answered unknown job " + response.jobId());
                    return;
                }
                future.complete(response);
            }
        } catch (IOException e) {
            fail(describeExit(e));
        }
    }

    private String describeExit(IOException cause) {
        if (draining && pending.isEmpty()) {
            return "PDF worker " + id + " was retired";
        }
        try {
            if (process.waitFor(2, TimeUnit.SECONDS)) {
                return "PDF worker "
                        + id
                        + " exited unexpectedly (exit code "
                        + process.exitValue()
                        + ")";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return "Lost contact with PDF worker " + id + ": " + cause.getMessage();
    }

    /** Kills the process; every job in flight on it fails with {@code reason}. */
    void fail(String reason) {
        synchronized (this) {
            if (brokenReason != null) {
                return;
            }
            brokenReason = reason;
        }
        process.destroyForcibly();
        for (Integer jobId : List.copyOf(pending.keySet())) {
            CompletableFuture<PdfWorkerProtocol.Response> future = pending.remove(jobId);
            if (future != null) {
                future.completeExceptionally(new PdfWorkerDiedException(reason));
            }
        }
    }

    boolean usable() {
        return brokenReason == null && !draining && process.isAlive();
    }

    /** Takes no new jobs; the pool closes it once nothing is in flight. */
    void drain() {
        draining = true;
    }

    boolean draining() {
        return draining;
    }

    int id() {
        return id;
    }

    int capacity() {
        return capacity;
    }

    int inFlight() {
        return inFlight.get();
    }

    int jobs() {
        return jobs.get();
    }

    long pid() {
        return process.pid();
    }

    long idleNanos() {
        return System.nanoTime() - lastUsedNanos;
    }

    @Override
    public void close() {
        draining = true;
        try {
            // Closing stdin lets the worker exit on its own.
            synchronized (toWorker) {
                toWorker.close();
            }
        } catch (IOException ignored) {
        }
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly();
            }
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
        }
        fail("PDF worker " + id + " was shut down");
    }
}
