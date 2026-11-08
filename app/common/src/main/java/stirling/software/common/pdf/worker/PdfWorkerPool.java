package stirling.software.common.pdf.worker;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.jpdfium.panama.NativeLoader;

/**
 * Runs PDFium jobs in worker processes, since PDFium allows one call at a time per process. Workers
 * start on demand and retire when idle; off or failing, jobs run in this JVM.
 */
@Slf4j
@Component
public class PdfWorkerPool implements DisposableBean {

    private static final Duration START_TIMEOUT = Duration.ofSeconds(60);
    private static final Duration SPAWN_FAILURE_COOLDOWN = Duration.ofMinutes(5);

    /** Resolved pool settings; {@code command} is null when the pool is off. */
    record Config(
            int size,
            int maxJobsPerWorker,
            Duration idleTimeout,
            Duration jobTimeout,
            List<String> command) {}

    private final Config config;
    private final Semaphore permits;
    private final ConcurrentLinkedDeque<PdfWorkerProcess> idle = new ConcurrentLinkedDeque<>();
    private final Set<PdfWorkerProcess> live = ConcurrentHashMap.newKeySet();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final ScheduledExecutorService timer;
    private volatile long spawnBlockedUntilNanos;
    private volatile boolean spawnBlocked;
    private volatile boolean nativesReady;
    private volatile boolean closed;

    @Autowired
    public PdfWorkerPool(ApplicationProperties properties) {
        this(resolve(properties.getSystem().getPdfWorkers()));
    }

    PdfWorkerPool(Config config) {
        this.config = config;
        this.permits = new Semaphore(Math.max(1, config.size()), true);
        this.timer =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "pdf-worker-pool");
                            t.setDaemon(true);
                            return t;
                        });
        if (enabled()) {
            long period = Math.max(1, Math.min(30, config.idleTimeout().toSeconds() / 2));
            timer.scheduleWithFixedDelay(this::retireIdle, period, period, TimeUnit.SECONDS);
            log.info(
                    "PDF worker pool enabled: up to {} worker processes, started on demand",
                    config.size());
        }
    }

    /** A pool that always runs jobs in this JVM; for callers built outside Spring. */
    public static PdfWorkerPool inProcess() {
        return new PdfWorkerPool(
                new Config(1, 1, Duration.ofMinutes(5), Duration.ofMinutes(10), null));
    }

    public boolean enabled() {
        return config.command() != null && !closed;
    }

    /** Runs the job in a worker when the pool is on, otherwise in this JVM. */
    public <R> R execute(PdfWorkerJob<R> job) throws IOException {
        if (!enabled() || spawnBlockedNow()) {
            return job.run();
        }
        try {
            permits.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InterruptedIOException("Interrupted while waiting for a PDF worker");
        }
        try {
            PdfWorkerProcess worker = takeIdle();
            if (worker == null) {
                try {
                    worker = spawn();
                } catch (IOException e) {
                    spawnBlockedUntilNanos = System.nanoTime() + SPAWN_FAILURE_COOLDOWN.toNanos();
                    spawnBlocked = true;
                    log.warn(
                            "Could not start a PDF worker, running PDF jobs in-process for {}"
                                    + " minutes: {}",
                            SPAWN_FAILURE_COOLDOWN.toMinutes(),
                            e.getMessage());
                    return job.run();
                }
            }
            try {
                R result = worker.run(job, config.jobTimeout());
                giveBack(worker);
                return result;
            } catch (PdfWorkerJobException e) {
                giveBack(worker);
                throw e;
            } catch (IOException e) {
                // The worker died mid-job. Don't retry in-process: the PDF may be what crashed it.
                log.warn("PDF worker {} failed: {}", worker.id(), e.getMessage());
                discard(worker);
                throw e;
            } catch (RuntimeException | Error e) {
                discard(worker);
                throw e;
            }
        } finally {
            permits.release();
        }
    }

    private boolean spawnBlockedNow() {
        // nanoTime may be negative, so compare by difference and only after a failure.
        if (spawnBlocked && System.nanoTime() - spawnBlockedUntilNanos >= 0) {
            spawnBlocked = false;
        }
        return spawnBlocked;
    }

    private PdfWorkerProcess takeIdle() {
        PdfWorkerProcess worker;
        while ((worker = idle.pollFirst()) != null) {
            if (worker.usable()) {
                return worker;
            }
            discard(worker);
        }
        return null;
    }

    private PdfWorkerProcess spawn() throws IOException {
        extractNativesOnce();
        PdfWorkerProcess worker =
                PdfWorkerProcess.start(
                        nextId.getAndIncrement(), config.command(), START_TIMEOUT, timer);
        live.add(worker);
        if (closed) {
            discard(worker);
            throw new IOException("PDF worker pool is shut down");
        }
        return worker;
    }

    // Extraction needs more heap than a worker gets; do it here once, workers reuse the cache.
    private void extractNativesOnce() throws IOException {
        if (nativesReady) {
            return;
        }
        synchronized (this) {
            if (!nativesReady) {
                try {
                    NativeLoader.ensureLoaded();
                } catch (RuntimeException | LinkageError e) {
                    throw new IOException("PDFium natives could not be loaded", e);
                }
                nativesReady = true;
            }
        }
    }

    private void giveBack(PdfWorkerProcess worker) {
        if (closed || !worker.usable() || worker.jobs() >= config.maxJobsPerWorker()) {
            discard(worker);
            return;
        }
        // Most recently used first, so the cold end of the deque is what retires.
        idle.offerFirst(worker);
    }

    private void discard(PdfWorkerProcess worker) {
        live.remove(worker);
        timer.execute(worker::close);
    }

    private void retireIdle() {
        long limit = config.idleTimeout().toNanos();
        for (PdfWorkerProcess worker : idle) {
            if (worker.idleNanos() > limit && idle.remove(worker)) {
                log.debug("Retiring idle PDF worker {}", worker.id());
                discard(worker);
            }
        }
    }

    int liveWorkers() {
        return live.size();
    }

    @Override
    public void destroy() {
        closed = true;
        for (PdfWorkerProcess worker : live) {
            worker.close();
        }
        live.clear();
        idle.clear();
        timer.shutdownNow();
    }

    static Config resolve(ApplicationProperties.PdfWorkers settings) {
        int cores = Runtime.getRuntime().availableProcessors();
        int size = settings.getCount() > 0 ? settings.getCount() : Math.max(1, cores - 1);
        List<String> command = null;
        if (shouldEnable(settings.getEnabled())) {
            try {
                command = PdfWorkerLauncher.command(settings.getMaxHeap(), PdfWorkerMain.class);
            } catch (RuntimeException e) {
                log.warn("PDF worker pool disabled, could not build the worker command", e);
            }
        }
        return new Config(
                size,
                Math.max(1, settings.getMaxJobsPerWorker()),
                Duration.ofSeconds(Math.max(1, settings.getIdleTimeoutSeconds())),
                Duration.ofMinutes(Math.max(1, settings.getJobTimeoutMinutes())),
                command);
    }

    private static boolean shouldEnable(String mode) {
        String value = mode == null ? "auto" : mode.trim().toLowerCase(Locale.ROOT);
        if ("true".equals(value)) {
            return true;
        }
        if ("false".equals(value)) {
            return false;
        }
        // Desktop installs are single-user; extra JVMs would only cost the user RAM.
        return !Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE"))
                && !Boolean.parseBoolean(System.getenv("STIRLING_PDF_TAURI_MODE"));
    }
}
