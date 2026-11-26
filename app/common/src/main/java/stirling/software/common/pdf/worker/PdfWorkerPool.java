package stirling.software.common.pdf.worker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.jpdfium.instance.PdfiumInstancePool;
import stirling.software.jpdfium.panama.NativeLoader;

/**
 * Runs PDFium jobs in worker processes so a crash in PDFium never reaches the server. Each worker
 * hosts several PDFium instances and runs one job per instance at a time; workers start on demand
 * and retire when idle.
 *
 * <p>A worker that dies takes every job in flight on it down. Those jobs are retried once, one at a
 * time, in a separate single-instance quarantine worker: an innocent job then succeeds, and a file
 * that crashes PDFium again fails alone. A job that runs past the time limit kills its worker and
 * is not retried.
 *
 * <p>With the pool off (desktop, or {@code pdfWorkers.enabled: false}) jobs run in this JVM.
 */
@Slf4j
@Component
public class PdfWorkerPool implements DisposableBean {

    private static final Duration START_TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_AUTO_INSTANCES = 4;

    /**
     * Resolved pool settings. With {@code enabled} false jobs run in this JVM; enabled with a null
     * {@code command} means the worker could not be set up, and jobs fail unless {@code
     * inProcessFallback} is set.
     */
    record Config(
            boolean enabled,
            int processes,
            int instancesPerWorker,
            int maxJobsPerWorker,
            Duration idleTimeout,
            Duration jobTimeout,
            List<String> command,
            List<String> quarantineCommand,
            boolean inProcessFallback) {}

    private final Config config;
    private final Semaphore slots;
    private final Semaphore quarantineSlot = new Semaphore(1, true);
    private final List<PdfWorkerProcess> live = new ArrayList<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final ScheduledExecutorService timer;
    private final Object spawnLock = new Object();
    private PdfWorkerProcess quarantine;
    private volatile boolean nativesReady;
    private volatile boolean closed;

    @Autowired
    public PdfWorkerPool(ApplicationProperties properties) {
        this(resolve(properties.getSystem().getPdfWorkers()));
    }

    PdfWorkerPool(Config config) {
        this.config = config;
        this.slots =
                new Semaphore(
                        Math.max(1, config.processes()) * Math.max(1, config.instancesPerWorker()),
                        true);
        this.timer =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "pdf-worker-pool");
                            t.setDaemon(true);
                            return t;
                        });
        if (enabled()) {
            long period = Math.max(1, Math.min(10, config.idleTimeout().toSeconds() / 4));
            timer.scheduleWithFixedDelay(this::retireIdle, period, period, TimeUnit.SECONDS);
            log.info(
                    "PDF worker pool enabled: up to {} worker process(es) with {} PDFium"
                            + " instance(s) each, started on demand",
                    config.processes(),
                    config.instancesPerWorker());
        }
    }

    /** A pool that always runs jobs in this JVM; for callers built outside Spring. */
    public static PdfWorkerPool inProcess() {
        return new PdfWorkerPool(
                new Config(
                        false,
                        1,
                        1,
                        1,
                        Duration.ofMinutes(5),
                        Duration.ofMinutes(10),
                        null,
                        null,
                        false));
    }

    public boolean enabled() {
        return config.enabled() && !closed;
    }

    /**
     * Runs the job in a worker when the pool is on, otherwise in this JVM.
     *
     * @throws PdfWorkerJobException the job failed on a working engine (bad input, for example)
     * @throws IOException the engine was unavailable, timed out, or crashed on this file
     */
    public <R> R execute(PdfWorkerJob<R> job) throws IOException {
        if (!config.enabled()) {
            return job.run();
        }
        if (closed) {
            throw new IOException("The PDF engine is shutting down");
        }
        if (config.command() == null) {
            if (config.inProcessFallback()) {
                return job.run();
            }
            throw new IOException("The PDF engine is unavailable: its worker could not be set up");
        }
        byte[] request = encode(job);
        acquire(slots);
        try {
            PdfWorkerProcess worker;
            try {
                worker = workerWithRoom();
            } catch (IOException spawnFailed) {
                if (config.inProcessFallback()) {
                    log.warn(
                            "No PDF worker available, running the {} job in the server: {}",
                            job.type(),
                            spawnFailed.getMessage());
                    return job.run();
                }
                throw new IOException(
                        "The PDF engine could not start: " + spawnFailed.getMessage(), spawnFailed);
            }
            try {
                return decode(job, await(worker, job.type(), request));
            } catch (PdfWorkerDiedException died) {
                log.warn(
                        "PDF worker {} died with a {} job in flight ({}); retrying it alone",
                        worker.id(),
                        job.type(),
                        died.getMessage());
                return runInQuarantine(job, request);
            }
        } finally {
            slots.release();
        }
    }

    private <R> R runInQuarantine(PdfWorkerJob<R> job, byte[] request) throws IOException {
        acquire(quarantineSlot);
        try {
            PdfWorkerProcess worker = quarantineWorker();
            try {
                return decode(job, await(worker, job.type(), request));
            } catch (PdfWorkerDiedException again) {
                log.error(
                        "A {} job crashed the PDF engine again on its own; rejecting the file: {}",
                        job.type(),
                        again.getMessage());
                throw new IOException(
                        "The PDF engine crashed while processing this file. The file may be"
                                + " damaged or malformed.",
                        again);
            }
        } finally {
            quarantineSlot.release();
        }
    }

    private PdfWorkerProtocol.Response await(PdfWorkerProcess worker, String type, byte[] request)
            throws IOException {
        try {
            CompletableFuture<PdfWorkerProtocol.Response> future = worker.submit(type, request);
            return future.get(config.jobTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            worker.fail(
                    "a " + type + " job ran past " + config.jobTimeout().toMinutes() + " minutes");
            throw new IOException(
                    "PDF processing timed out after "
                            + config.jobTimeout().toMinutes()
                            + " minutes");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof PdfWorkerDiedException died) {
                throw died;
            }
            throw new IOException("PDF worker job failed", e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InterruptedIOException("Interrupted while waiting for a PDF worker");
        } finally {
            worker.finished();
            afterJob(worker);
        }
    }

    private static <R> byte[] encode(PdfWorkerJob<R> job) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            job.writeRequest(out);
        }
        return bytes.toByteArray();
    }

    private static <R> R decode(PdfWorkerJob<R> job, PdfWorkerProtocol.Response response)
            throws IOException {
        if (response.status() == PdfWorkerProtocol.STATUS_OK) {
            return job.readResult(
                    new DataInputStream(new ByteArrayInputStream(response.payload())));
        }
        if (response.status() == PdfWorkerProtocol.STATUS_ERROR) {
            throw PdfWorkerProtocol.jobException(response.payload());
        }
        throw new IOException("PDF worker sent an unknown status: " + response.status());
    }

    private static void acquire(Semaphore semaphore) throws InterruptedIOException {
        try {
            semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InterruptedIOException("Interrupted while waiting for a PDF worker");
        }
    }

    // Least-loaded worker with a free instance; otherwise a new worker while under the process
    // limit; otherwise the least-loaded worker, which queues the job behind its instances.
    // Starts are serialised so a burst of jobs shares the first worker instead of each starting
    // one.
    private PdfWorkerProcess workerWithRoom() throws IOException {
        PdfWorkerProcess existing = pickWorker();
        if (existing != null) {
            return existing;
        }
        synchronized (spawnLock) {
            existing = pickWorker();
            if (existing != null) {
                return existing;
            }
            PdfWorkerProcess started = spawn(config.command(), config.instancesPerWorker());
            synchronized (live) {
                started.reserve();
                live.add(started);
            }
            return started;
        }
    }

    private PdfWorkerProcess pickWorker() throws IOException {
        synchronized (live) {
            if (closed) {
                throw new IOException("PDF worker pool is shut down");
            }
            live.removeIf(this::closeIfDead);
            PdfWorkerProcess best = leastLoaded();
            if (best == null) {
                return null;
            }
            boolean atLimit =
                    live.stream().filter(PdfWorkerProcess::usable).count()
                            >= Math.max(1, config.processes());
            if (best.inFlight() < best.capacity() || atLimit) {
                // Reserved under the lock, so retirement cannot close it before the job is sent.
                best.reserve();
                return best;
            }
            return null;
        }
    }

    private PdfWorkerProcess leastLoaded() {
        PdfWorkerProcess best = null;
        for (PdfWorkerProcess worker : live) {
            if (worker.usable() && (best == null || worker.inFlight() < best.inFlight())) {
                best = worker;
            }
        }
        return best;
    }

    private PdfWorkerProcess quarantineWorker() throws IOException {
        synchronized (live) {
            if (closed) {
                throw new IOException("PDF worker pool is shut down");
            }
            if (quarantine != null && quarantine.usable()) {
                quarantine.reserve();
                return quarantine;
            }
        }
        PdfWorkerProcess started = spawn(config.quarantineCommand(), 1);
        synchronized (live) {
            PdfWorkerProcess previous = quarantine;
            quarantine = started;
            started.reserve();
            if (previous != null) {
                closeLater(previous);
            }
        }
        return started;
    }

    private PdfWorkerProcess spawn(List<String> command, int instances) throws IOException {
        extractNativesOnce();
        return PdfWorkerProcess.start(
                nextId.getAndIncrement(), command, instances, START_TIMEOUT, timer);
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
                try {
                    // Copying the bundle per instance takes several times a worker's idle heap.
                    PdfiumInstancePool.prepareCopies(config.instancesPerWorker());
                } catch (RuntimeException | LinkageError e) {
                    log.warn(
                            "Could not prepare PDFium instance copies; workers will prepare"
                                    + " their own or run one instance: {}",
                            e.getMessage());
                }
                nativesReady = true;
            }
        }
    }

    private void afterJob(PdfWorkerProcess worker) {
        synchronized (live) {
            if (worker.jobs() >= config.maxJobsPerWorker()) {
                worker.drain();
            }
            if (worker.inFlight() == 0
                    && (worker.draining() || !worker.usable())
                    && live.remove(worker)) {
                closeLater(worker);
            }
        }
    }

    private boolean closeIfDead(PdfWorkerProcess worker) {
        if (worker.usable()) {
            return false;
        }
        if (worker.inFlight() == 0) {
            closeLater(worker);
            return true;
        }
        return false;
    }

    private void closeLater(PdfWorkerProcess worker) {
        try {
            timer.execute(worker::close);
        } catch (RejectedExecutionException shutDown) {
            worker.close();
        }
    }

    private void retireIdle() {
        long limit = config.idleTimeout().toNanos();
        List<PdfWorkerProcess> retiring = new ArrayList<>();
        synchronized (live) {
            live.removeIf(
                    worker -> {
                        boolean idle = worker.inFlight() == 0 && worker.idleNanos() > limit;
                        boolean dead = !worker.usable() && worker.inFlight() == 0;
                        if (idle || dead) {
                            retiring.add(worker);
                            return true;
                        }
                        return false;
                    });
            if (quarantine != null
                    && quarantine.inFlight() == 0
                    && (quarantine.idleNanos() > limit || !quarantine.usable())) {
                retiring.add(quarantine);
                quarantine = null;
            }
        }
        for (PdfWorkerProcess worker : retiring) {
            log.debug("Retiring PDF worker {}", worker.id());
            worker.close();
        }
    }

    int liveWorkers() {
        synchronized (live) {
            return live.size();
        }
    }

    boolean quarantineRunning() {
        synchronized (live) {
            return quarantine != null && quarantine.usable();
        }
    }

    @Override
    public void destroy() {
        List<PdfWorkerProcess> all;
        synchronized (live) {
            closed = true;
            all = new ArrayList<>(live);
            if (quarantine != null) {
                all.add(quarantine);
            }
            live.clear();
            quarantine = null;
        }
        for (PdfWorkerProcess worker : all) {
            worker.close();
        }
        timer.shutdownNow();
    }

    static Config resolve(ApplicationProperties.PdfWorkers settings) {
        int cores = Runtime.getRuntime().availableProcessors();
        int processes = Math.max(1, settings.getCount());
        int instances =
                settings.getInstancesPerWorker() > 0
                        ? settings.getInstancesPerWorker()
                        : Math.max(1, Math.min(MAX_AUTO_INSTANCES, cores - 1));
        List<String> command = null;
        List<String> quarantineCommand = null;
        boolean enabled = shouldEnable(settings.getEnabled());
        if (enabled) {
            try {
                command =
                        PdfWorkerLauncher.command(
                                maxHeap(settings.getMaxHeap(), instances),
                                PdfWorkerMain.class,
                                instances);
                quarantineCommand =
                        PdfWorkerLauncher.command(
                                maxHeap(settings.getMaxHeap(), 1), PdfWorkerMain.class, 1);
            } catch (RuntimeException e) {
                log.error("Could not build the PDF worker command; PDFium jobs will fail", e);
                command = null;
            }
        }
        return new Config(
                enabled,
                processes,
                instances,
                Math.max(1, settings.getMaxJobsPerWorker()),
                Duration.ofSeconds(Math.max(1, settings.getIdleTimeoutSeconds())),
                Duration.ofMinutes(Math.max(1, settings.getJobTimeoutMinutes())),
                command,
                quarantineCommand,
                settings.isInProcessFallback());
    }

    // A Markdown job holds every page's text, so each concurrent job gets its own share of heap.
    static String maxHeap(String setting, int instances) {
        if (setting != null && !setting.isBlank() && !"auto".equalsIgnoreCase(setting.trim())) {
            return setting.trim();
        }
        return (384 + 256 * (instances - 1)) + "m";
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
