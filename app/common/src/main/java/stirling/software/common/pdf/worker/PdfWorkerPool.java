package stirling.software.common.pdf.worker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
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
 * that crashes PDFium again fails alone and is refused on sight for {@link #CRASHED_INPUT_TTL}. A
 * job that runs past the time limit kills its worker and is not retried. After a worker fails to
 * start, jobs fail fast for {@link #SPAWN_FAILURE_COOLDOWN} instead of each waiting on a new start.
 *
 * <p>With the pool off (desktop, or {@code pdfWorkers.enabled: false}) jobs run in this JVM.
 */
@Slf4j
@Component
public class PdfWorkerPool implements DisposableBean {

    private static final Duration START_TIMEOUT = Duration.ofSeconds(60);
    static final Duration SPAWN_FAILURE_COOLDOWN = Duration.ofSeconds(30);
    static final Duration CRASHED_INPUT_TTL = Duration.ofHours(1);
    private static final int MAX_CRASHED_INPUTS = 256;
    private static final int MAX_AUTO_INSTANCES = 4;
    private static final String CRASHED_FILE_MESSAGE =
            "The PDF engine crashed while processing this file. The file may be damaged or"
                    + " malformed.";

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
    private final Slots slots;
    private final Semaphore quarantineSlot = new Semaphore(1, true);
    private final List<PdfWorkerProcess> live = new ArrayList<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final ScheduledExecutorService timer;
    private final ExecutorService closer;
    private final Object spawnLock = new Object();
    private final Map<String, CrashedInput> crashedInputs = new LinkedHashMap<>();
    private final StartGuard workerStarts = new StartGuard();
    private final StartGuard quarantineStarts = new StartGuard();
    private PdfWorkerProcess quarantine;
    private int instancesPerWorker;
    private volatile boolean nativesReady;
    private volatile boolean closed;
    private volatile boolean hasCrashedInputs;

    private record CrashedInput(String sizes, long expiresNanos) {}

    @Autowired
    public PdfWorkerPool(ApplicationProperties properties) {
        this(resolve(properties.getSystem().getPdfWorkers()));
    }

    PdfWorkerPool(Config config) {
        this.config = config;
        this.instancesPerWorker = Math.max(1, config.instancesPerWorker());
        this.slots = new Slots(Math.max(1, config.processes()) * instancesPerWorker);
        this.timer =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "pdf-worker-pool");
                            t.setDaemon(true);
                            return t;
                        });
        this.closer =
                Executors.newCachedThreadPool(
                        r -> {
                            Thread t = new Thread(r, "pdf-worker-closer");
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
        if (hasCrashedInputs && crashedBefore(job)) {
            throw new IOException(CRASHED_FILE_MESSAGE);
        }
        byte[] request = encode(job);
        PdfWorkerDiedException died;
        Lease slot = acquire(slots, "The PDF engine is busy; no worker was free");
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
                return decode(job, await(worker, job.type(), request, slot));
            } catch (PdfWorkerDiedException e) {
                log.warn(
                        "PDF worker {} died with a {} job in flight ({}); retrying it alone",
                        worker.id(),
                        job.type(),
                        e.getMessage());
                died = e;
            }
        } finally {
            slot.releaseUnlessHandedOff();
        }
        return runInQuarantine(job, request, died);
    }

    // Holds no worker slot while it waits, so retries after a crash never starve healthy jobs.
    private <R> R runInQuarantine(PdfWorkerJob<R> job, byte[] request, PdfWorkerDiedException first)
            throws IOException {
        Lease slot;
        try {
            slot =
                    acquire(
                            quarantineSlot,
                            "The PDF engine is busy recovering from a crash; try again shortly");
        } catch (IOException busy) {
            busy.addSuppressed(first);
            throw busy;
        }
        try {
            PdfWorkerProcess worker;
            try {
                worker = quarantineWorker();
            } catch (IOException spawnFailed) {
                throw new IOException(
                        "The PDF engine could not start: " + spawnFailed.getMessage(), spawnFailed);
            }
            try {
                return decode(job, await(worker, job.type(), request, slot));
            } catch (PdfWorkerDiedException again) {
                log.error(
                        "A {} job crashed the PDF engine again on its own; rejecting the file: {}",
                        job.type(),
                        again.getMessage());
                rememberCrash(job);
                throw new IOException(CRASHED_FILE_MESSAGE, again);
            }
        } finally {
            slot.releaseUnlessHandedOff();
        }
    }

    private void rememberCrash(PdfWorkerJob<?> job) {
        String sizes = sizes(job);
        String fingerprint = sizes == null ? null : fingerprint(job);
        if (fingerprint == null) {
            return;
        }
        synchronized (crashedInputs) {
            crashedInputs.remove(fingerprint);
            crashedInputs.put(
                    fingerprint,
                    new CrashedInput(sizes, System.nanoTime() + CRASHED_INPUT_TTL.toNanos()));
            while (crashedInputs.size() > MAX_CRASHED_INPUTS) {
                crashedInputs.remove(crashedInputs.keySet().iterator().next());
            }
            hasCrashedInputs = true;
        }
    }

    // Sizes first: only a job whose files match a remembered crash in size pays for hashing.
    private boolean crashedBefore(PdfWorkerJob<?> job) {
        String sizes = sizes(job);
        if (sizes == null) {
            return false;
        }
        synchronized (crashedInputs) {
            long now = System.nanoTime();
            crashedInputs.values().removeIf(entry -> entry.expiresNanos() - now < 0);
            hasCrashedInputs = !crashedInputs.isEmpty();
            if (crashedInputs.values().stream().noneMatch(entry -> entry.sizes().equals(sizes))) {
                return false;
            }
        }
        String fingerprint = fingerprint(job);
        synchronized (crashedInputs) {
            return fingerprint != null && crashedInputs.containsKey(fingerprint);
        }
    }

    private static String sizes(PdfWorkerJob<?> job) {
        List<Path> files = job.inputFiles();
        if (files.isEmpty()) {
            return null;
        }
        StringBuilder key = new StringBuilder(job.type());
        try {
            for (Path file : files) {
                key.append(':').append(Files.size(file));
            }
        } catch (IOException e) {
            return null;
        }
        return key.toString();
    }

    // Content, not paths: each upload lands in a new temp file.
    static String fingerprint(PdfWorkerJob<?> job) {
        List<Path> files = job.inputFiles();
        if (files.isEmpty()) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(job.type().getBytes(StandardCharsets.UTF_8));
            byte[] buffer = new byte[64 * 1024];
            for (Path file : files) {
                digest.update((byte) 0);
                try (InputStream in = Files.newInputStream(file)) {
                    int read;
                    while ((read = in.read(buffer)) > 0) {
                        digest.update(buffer, 0, read);
                    }
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException e) {
            return null;
        }
    }

    // The worker's count and the caller's slot are freed when the job really ends, not when this
    // caller stops waiting: an interrupted caller leaves its job running on the worker.
    private PdfWorkerProtocol.Response await(
            PdfWorkerProcess worker, String type, byte[] request, Lease slot) throws IOException {
        CompletableFuture<PdfWorkerProtocol.Response> future;
        try {
            future = worker.submit(type, request);
        } catch (PdfWorkerDiedException e) {
            jobEnded(worker);
            throw e;
        }
        slot.handOff();
        future.whenComplete(
                (response, error) -> {
                    jobEnded(worker);
                    slot.release();
                });
        try {
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
        }
    }

    private void jobEnded(PdfWorkerProcess worker) {
        worker.finished();
        afterJob(worker);
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

    // Bounded so a request never waits forever behind a stuck queue; the time limit is the same
    // one a running job gets.
    private Lease acquire(Semaphore semaphore, String busyMessage) throws IOException {
        try {
            if (!semaphore.tryAcquire(config.jobTimeout().toMillis(), TimeUnit.MILLISECONDS)) {
                throw new IOException(
                        busyMessage + " within " + config.jobTimeout().toMinutes() + " minutes");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InterruptedIOException("Interrupted while waiting for a PDF worker");
        }
        return new Lease(semaphore);
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
            PdfWorkerProcess started;
            try {
                started = spawn(config.command(), instancesPerWorker(), workerStarts);
            } catch (IOException spawnFailed) {
                PdfWorkerProcess busy = queueOnBusiestFree();
                if (busy != null) {
                    return busy;
                }
                throw spawnFailed;
            }
            matchCapacity(started);
            synchronized (live) {
                if (closed) {
                    closeLater(started);
                    throw new IOException("PDF worker pool is shut down");
                }
                started.reserve();
                live.add(started);
            }
            return started;
        }
    }

    // A running worker can still take the job behind its own instances when no new one starts.
    private PdfWorkerProcess queueOnBusiestFree() {
        synchronized (live) {
            PdfWorkerProcess best = leastLoaded();
            if (best != null) {
                best.reserve();
            }
            return best;
        }
    }

    // A worker that could not isolate its instances reports fewer than asked for (always one on
    // Windows); admitting jobs for the missing instances would queue them inside the worker while
    // their time limit runs.
    private void matchCapacity(PdfWorkerProcess worker) {
        synchronized (live) {
            int reported = Math.max(1, worker.capacity());
            if (reported >= instancesPerWorker) {
                return;
            }
            log.warn(
                    "PDF worker {} runs {} PDFium instance(s) instead of {}; PDF job concurrency"
                            + " drops to {}",
                    worker.id(),
                    reported,
                    instancesPerWorker,
                    Math.max(1, config.processes()) * reported);
            slots.shrink(Math.max(1, config.processes()) * (instancesPerWorker - reported));
            instancesPerWorker = reported;
        }
    }

    private int instancesPerWorker() {
        synchronized (live) {
            return instancesPerWorker;
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
        PdfWorkerProcess started = spawn(config.quarantineCommand(), 1, quarantineStarts);
        synchronized (live) {
            if (closed) {
                closeLater(started);
                throw new IOException("PDF worker pool is shut down");
            }
            PdfWorkerProcess previous = quarantine;
            quarantine = started;
            started.reserve();
            if (previous != null) {
                closeLater(previous);
            }
        }
        return started;
    }

    private PdfWorkerProcess spawn(List<String> command, int instances, StartGuard guard)
            throws IOException {
        String failure = guard.failure;
        if (failure != null && guard.blockedUntilNanos - System.nanoTime() > 0) {
            throw new IOException(failure);
        }
        try {
            extractNativesOnce();
            PdfWorkerProcess started =
                    PdfWorkerProcess.start(
                            nextId.getAndIncrement(), command, instances, START_TIMEOUT, timer);
            guard.failure = null;
            return started;
        } catch (IOException | RuntimeException e) {
            guard.blockedUntilNanos = System.nanoTime() + SPAWN_FAILURE_COOLDOWN.toNanos();
            guard.failure = String.valueOf(e.getMessage());
            log.error(
                    "Could not start a PDF worker; PDF jobs will fail for the next {} s: {}",
                    SPAWN_FAILURE_COOLDOWN.toSeconds(),
                    e.getMessage(),
                    e);
            throw e instanceof IOException io ? io : new IOException(e.getMessage(), e);
        }
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
                    PdfiumInstancePool.prepareCopies(instancesPerWorker());
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

    // close() waits for the process to exit; on the timer it would hold up retirement.
    private void closeLater(PdfWorkerProcess worker) {
        try {
            closer.execute(worker::close);
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
            closeLater(worker);
        }
    }

    int startedWorkers() {
        return nextId.get() - 1;
    }

    int freeSlots() {
        return slots.availablePermits();
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
        closer.shutdown();
        try {
            closer.awaitTermination(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    static Config resolve(ApplicationProperties.PdfWorkers settings) {
        int cores = Runtime.getRuntime().availableProcessors();
        int processes = Math.max(1, settings.getCount());
        int requested =
                settings.getInstancesPerWorker() > 0
                        ? settings.getInstancesPerWorker()
                        : Math.max(1, Math.min(MAX_AUTO_INSTANCES, cores - 1));
        int instances = Math.min(requested, PdfiumInstancePool.maxInstances());
        if (instances < requested) {
            log.info(
                    "PDFium instances cannot be isolated on this platform; each PDF worker runs"
                            + " one, so set pdfWorkers.count for more parallel jobs");
        }
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

    /** A fair semaphore whose permit count can drop when workers turn out smaller than planned. */
    private static final class Slots extends Semaphore {
        Slots(int permits) {
            super(permits, true);
        }

        void shrink(int by) {
            reducePermits(by);
        }
    }

    private static final class StartGuard {
        volatile long blockedUntilNanos;
        volatile String failure;
    }

    /** One permit; released exactly once, by the caller or by the job's completion. */
    private static final class Lease {
        private final Semaphore semaphore;
        private final AtomicBoolean released = new AtomicBoolean();
        private volatile boolean handedOff;

        Lease(Semaphore semaphore) {
            this.semaphore = semaphore;
        }

        void handOff() {
            handedOff = true;
        }

        void release() {
            if (released.compareAndSet(false, true)) {
                semaphore.release();
            }
        }

        void releaseUnlessHandedOff() {
            if (!handedOff) {
                release();
            }
        }
    }
}
