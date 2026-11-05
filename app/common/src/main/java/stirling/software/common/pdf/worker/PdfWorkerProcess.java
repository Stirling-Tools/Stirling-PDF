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
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import lombok.extern.slf4j.Slf4j;

/** One live worker process. Used by a single job at a time; the pool hands it out. */
@Slf4j
final class PdfWorkerProcess implements Closeable {

    private final int id;
    private final Process process;
    private final DataOutputStream toWorker;
    private final DataInputStream fromWorker;
    private final ScheduledExecutorService timer;
    private int jobs;
    private volatile long lastUsedNanos = System.nanoTime();
    private volatile boolean broken;

    private PdfWorkerProcess(int id, Process process, ScheduledExecutorService timer) {
        this.id = id;
        this.process = process;
        this.timer = timer;
        this.toWorker =
                new DataOutputStream(
                        new BufferedOutputStream(process.getOutputStream(), 64 * 1024));
        this.fromWorker =
                new DataInputStream(new BufferedInputStream(process.getInputStream(), 64 * 1024));
    }

    static PdfWorkerProcess start(
            int id, List<String> command, Duration startTimeout, ScheduledExecutorService timer)
            throws IOException {
        // An argfile keeps long classpaths under the Windows command-line limit.
        Path argFile = Files.createTempFile("stirling-pdf-worker-", ".args");
        Files.write(
                argFile,
                command.subList(1, command.size()).stream().map(PdfWorkerLauncher::quote).toList(),
                StandardCharsets.UTF_8);
        try {
            return launch(id, List.of(command.getFirst(), "@" + argFile), startTimeout, timer);
        } finally {
            // The JVM has read the argfile once it reports ready (or has failed).
            Files.deleteIfExists(argFile);
        }
    }

    private static PdfWorkerProcess launch(
            int id, List<String> command, Duration startTimeout, ScheduledExecutorService timer)
            throws IOException {
        ProcessBuilder builder = new ProcessBuilder(command);
        // These would inject the server's own JVM flags (heap, AOT cache) into the worker.
        builder.environment().remove("JAVA_TOOL_OPTIONS");
        builder.environment().remove("JDK_JAVA_OPTIONS");
        builder.environment().remove("_JAVA_OPTIONS");
        builder.redirectError(ProcessBuilder.Redirect.INHERIT);
        long started = System.nanoTime();
        PdfWorkerProcess worker = new PdfWorkerProcess(id, builder.start(), timer);
        AtomicBoolean timedOut = new AtomicBoolean();
        ScheduledFuture<?> kill = worker.killAfter(startTimeout, timedOut);
        try {
            PdfWorkerProtocol.readHeader(worker.fromWorker);
            if (worker.fromWorker.readByte() != PdfWorkerProtocol.STATUS_READY) {
                throw new IOException("PDF worker did not report ready");
            }
        } catch (IOException e) {
            worker.close();
            throw new IOException(
                    timedOut.get()
                            ? "PDF worker did not start within " + startTimeout.toSeconds() + "s"
                            : "PDF worker failed to start: " + e.getMessage(),
                    e);
        } finally {
            kill.cancel(false);
        }
        log.info(
                "Started PDF worker {} (pid {}) in {} ms",
                id,
                worker.process.pid(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
        return worker;
    }

    /**
     * Runs one job. A {@link PdfWorkerJobException} means the job failed but the worker is fine;
     * any other IOException means the worker is gone and must not be reused.
     */
    <R> R run(PdfWorkerJob<R> job, Duration timeout) throws IOException {
        AtomicBoolean timedOut = new AtomicBoolean();
        ScheduledFuture<?> kill = killAfter(timeout, timedOut);
        try {
            PdfWorkerProtocol.writeHeader(toWorker);
            PdfWorkerProtocol.writeString(toWorker, job.type());
            job.writeRequest(toWorker);
            toWorker.flush();

            PdfWorkerProtocol.readHeader(fromWorker);
            byte status = fromWorker.readByte();
            if (status == PdfWorkerProtocol.STATUS_OK) {
                return job.readResult(fromWorker);
            }
            if (status == PdfWorkerProtocol.STATUS_ERROR) {
                String message = PdfWorkerProtocol.readString(fromWorker);
                throw new PdfWorkerJobException(message, PdfWorkerProtocol.readString(fromWorker));
            }
            throw new IOException("PDF worker sent an unknown status: " + status);
        } catch (PdfWorkerJobException e) {
            throw e;
        } catch (IOException e) {
            broken = true;
            throw new IOException(describeFailure(timedOut.get(), timeout), e);
        } finally {
            kill.cancel(false);
            jobs++;
            lastUsedNanos = System.nanoTime();
        }
    }

    private String describeFailure(boolean timedOut, Duration timeout) {
        if (timedOut) {
            return "PDF processing timed out after " + timeout.toMinutes() + " minutes";
        }
        try {
            if (process.waitFor(2, TimeUnit.SECONDS)) {
                return "PDF worker exited unexpectedly (exit code " + process.exitValue() + ")";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return "Lost contact with the PDF worker";
    }

    private ScheduledFuture<?> killAfter(Duration delay, AtomicBoolean flag) {
        return timer.schedule(
                () -> {
                    flag.set(true);
                    process.destroyForcibly();
                },
                delay.toMillis(),
                TimeUnit.MILLISECONDS);
    }

    boolean usable() {
        return !broken && process.isAlive();
    }

    int id() {
        return id;
    }

    int jobs() {
        return jobs;
    }

    long pid() {
        return process.pid();
    }

    long idleNanos() {
        return System.nanoTime() - lastUsedNanos;
    }

    @Override
    public void close() {
        broken = true;
        try {
            // Closing stdin lets the worker exit on its own.
            toWorker.close();
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
        try {
            fromWorker.close();
        } catch (IOException ignored) {
        }
    }
}
