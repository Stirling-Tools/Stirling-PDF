package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.zip.ZipFile;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.memory.Admission;
import stirling.software.officeconvert.topdf.OfficeToPdf;
import stirling.software.officeconvert.topdf.RenderJob;
import stirling.software.officeconvert.topdf.io.OfficeZip;

/**
 * Word, PowerPoint and Excel to PDF in process, with LibreOffice as the fallback. Bounded slots and
 * queue; one deadline per request covers the wait, the conversion and any fallback.
 */
@Slf4j
@Service
public class OfficeToPdfService {

    private static final Set<String> EXTENSIONS =
            Set.of(
                    "docx", "docm", "dotx", "dotm", "pptx", "pptm", "ppsx", "ppsm", "potx", "potm",
                    "xlsx", "xlsm", "xltx", "xltm", "xls", "xlt", "ppt", "pps", "pot");

    /** Binary Excel and PowerPoint files, which are not zip packages. */
    private static final Set<String> LEGACY = Set.of("xls", "xlt", "ppt", "pps", "pot");

    private static final long HEAP_PER_SLOT = 512L << 20;

    private static final int RETRY_AFTER_SECONDS = 5;

    private static final ScheduledExecutorService ALARMS =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().name("office-to-pdf-deadline").daemon().factory());

    /** Runs one conversion; tests replace the real converter. */
    @FunctionalInterface
    interface Converter {
        OfficeToPdf.Result convert(Path in, Path out, OfficeToPdf.Options options)
                throws IOException;
    }

    /** The LibreOffice conversion to fall back to, writing the same output file. */
    @FunctionalInterface
    public interface Fallback {
        void convert() throws IOException, InterruptedException;
    }

    private final ApplicationProperties.OfficeToPdf settings;
    private final Duration budget;
    private final Converter converter;
    private final Semaphore slots;
    private final int maxQueued;
    private final AtomicInteger queued = new AtomicInteger();

    @Autowired
    public OfficeToPdfService(
            ApplicationProperties applicationProperties,
            @Value("${spring.mvc.async.request-timeout:1200000}") long requestTimeoutMs) {
        this(
                applicationProperties.getOfficeToPdf(),
                budget(applicationProperties, requestTimeoutMs),
                OfficeToPdf::convert,
                Runtime.getRuntime().availableProcessors(),
                Runtime.getRuntime().maxMemory());
    }

    OfficeToPdfService(
            ApplicationProperties.OfficeToPdf settings,
            Duration budget,
            Converter converter,
            int processors,
            long maxHeap) {
        this.settings = settings;
        this.budget = budget;
        this.converter = converter;
        int concurrent =
                settings.getMaxConcurrent() > 0
                        ? settings.getMaxConcurrent()
                        : autoConcurrency(processors, maxHeap);
        this.slots = new Semaphore(concurrent, true);
        this.maxQueued = Math.max(0, settings.getMaxQueued());
        if (enabled()) {
            raiseXmlLimits();
        }
        log.info(
                "Office to PDF: engine {}, {} at once, {} queued, fallback to LibreOffice {}",
                settings.getEngine(),
                concurrent,
                maxQueued,
                settings.isFallbackToLibreOffice() ? "on" : "off");
    }

    static int autoConcurrency(int processors, long maxHeap) {
        int byCpu = Math.max(1, processors / 2);
        int byHeap = (int) Math.max(1, Math.min(Integer.MAX_VALUE, maxHeap / HEAP_PER_SLOT));
        return Math.min(byCpu, byHeap);
    }

    private static Duration budget(ApplicationProperties properties, long requestTimeoutMs) {
        long seconds = properties.getOfficeToPdf().getTimeoutSeconds();
        Duration wanted =
                seconds > 0
                        ? Duration.ofSeconds(seconds)
                        : Duration.ofMinutes(
                                properties
                                        .getProcessExecutor()
                                        .getTimeoutMinutes()
                                        .getLibreOfficeTimeoutMinutes());
        return withinRequest(wanted, requestTimeoutMs);
    }

    /** Ends before the request's own timeout, which would answer 500 and keep the slot busy. */
    static Duration withinRequest(Duration wanted, long requestTimeoutMs) {
        if (requestTimeoutMs <= 0) {
            return wanted;
        }
        long margin = Math.min(requestTimeoutMs / 10, 30_000);
        Duration cap = Duration.ofMillis(Math.max(1_000, requestTimeoutMs - margin));
        return wanted.compareTo(cap) > 0 ? cap : wanted;
    }

    /**
     * POI parses slides and relationship parts with the JVM's XML limits, which Java 24 cut to a
     * depth of 100; restore the older ones (depth 1000, entities bounded in total) unless set.
     */
    static void raiseXmlLimits() {
        setIfUnset("jdk.xml.maxElementDepth", "1000");
        setIfUnset("jdk.xml.totalEntitySizeLimit", "50000000");
        setIfUnset("jdk.xml.maxGeneralEntitySizeLimit", "0");
        setIfUnset("jdk.xml.elementAttributeLimit", "10000");
    }

    private static void setIfUnset(String property, String value) {
        if (System.getProperty(property) == null) {
            System.setProperty(property, value);
        }
    }

    /** Loads the converter and scans fonts off the request path, so a first conversion is fast. */
    @EventListener(ApplicationReadyEvent.class)
    public void warmUp() {
        if (enabled()) {
            Thread.ofPlatform()
                    .name("office-to-pdf-warm-up")
                    .daemon()
                    .start(
                            () ->
                                    OfficeToPdf.warmUp(
                                            OfficeToPdf.Format.DOCX,
                                            OfficeToPdf.Format.PPTX,
                                            OfficeToPdf.Format.XLSX));
        }
    }

    /** Whether Stirling Office Convert is the configured engine. */
    public boolean enabled() {
        return settings.getEngine() == ApplicationProperties.OfficeToPdf.Engine.STIRLING;
    }

    /** Whether the in-process converter takes files with this extension. */
    public boolean handles(String extension) {
        return enabled()
                && extension != null
                && EXTENSIONS.contains(extension.toLowerCase(Locale.ROOT));
    }

    /** The deadline, in {@link System#nanoTime()} terms, for a request starting now. */
    public long deadline() {
        return System.nanoTime() + budget.toNanos();
    }

    int available() {
        return slots.availablePermits();
    }

    int queued() {
        return queued.get();
    }

    /**
     * Converts {@code in} to {@code out}, retrying a refused or failed file with {@code
     * libreOffice} while time is left. A busy server, a timeout, an interrupt, a zip bomb or a
     * document over a size, page or output limit never falls back.
     */
    public void convert(
            Path in, Path out, long deadline, boolean libreOfficeAvailable, Fallback libreOffice)
            throws IOException, InterruptedException {
        String type = extensionOf(in);
        try {
            OfficeToPdf.Result result = convert(in, out, deadline);
            List<String> warnings = result.warnings();
            log.info(
                    "Converted .{} to PDF in process: {} pages{}",
                    type,
                    result.pages(),
                    warnings.isEmpty()
                            ? ""
                            : ", " + warnings.size() + " warnings, first: " + warnings.get(0));
            return;
        } catch (Unconverted e) {
            if (!e.retry()
                    || !settings.isFallbackToLibreOffice()
                    || !libreOfficeAvailable
                    || System.nanoTime() - deadline >= 0
                    || !LEGACY.contains(type) && isEmptyPackage(in)) {
                throw e.toResponse();
            }
            log.warn(
                    "Stirling Office Convert could not convert .{} ({}); retrying with LibreOffice",
                    type,
                    e.getMessage());
            Files.deleteIfExists(out);
            fallBack(libreOffice, deadline, e);
        }
    }

    /** Runs LibreOffice, interrupting it at the deadline so the whole request stays bounded. */
    private void fallBack(Fallback libreOffice, long deadline, Unconverted refused)
            throws IOException, InterruptedException {
        Alarm alarm = new Alarm(Thread.currentThread());
        ScheduledFuture<?> scheduled =
                ALARMS.schedule(
                        alarm, Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        try {
            libreOffice.convert();
        } catch (InterruptedException | IOException | RuntimeException e) {
            if (alarm.disarm()) {
                throw timedOut(e);
            }
            if (e instanceof InterruptedException || e instanceof InterruptedIOException) {
                throw e;
            }
            log.warn("LibreOffice could not convert it either: {}", e.getMessage());
            ResponseStatusException response = refused.toResponse();
            response.addSuppressed(e);
            throw response;
        } finally {
            alarm.disarm();
            scheduled.cancel(false);
        }
    }

    /** Interrupts a thread once, unless disarmed first; disarming clears its own interrupt. */
    private static final class Alarm implements Runnable {
        private final Thread thread;
        private boolean disarmed;
        private boolean fired;

        Alarm(Thread thread) {
            this.thread = thread;
        }

        @Override
        public synchronized void run() {
            if (!disarmed) {
                fired = true;
                thread.interrupt();
            }
        }

        synchronized boolean disarm() {
            if (!disarmed) {
                disarmed = true;
                if (fired) {
                    Thread.interrupted();
                }
            }
            return fired;
        }
    }

    private OfficeToPdf.Result convert(Path in, Path out, long deadline)
            throws IOException, Unconverted {
        long size = Files.size(in);
        long maxBytes = settings.getMaxFileSizeMB() << 20;
        if (maxBytes > 0 && size > maxBytes) {
            throw new Unconverted(
                    HttpStatus.CONTENT_TOO_LARGE,
                    "The file is larger than the "
                            + settings.getMaxFileSizeMB()
                            + " MB limit for converting Office files to PDF",
                    null,
                    true);
        }
        acquire(deadline);
        try {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) {
                throw busy();
            }
            OfficeToPdf.Options options =
                    OfficeToPdf.Options.defaults()
                            .timeout(Duration.ofNanos(remaining))
                            .maxPages(Math.max(0, settings.getMaxPages()))
                            .maxScratchBytes(Math.max(0, settings.getMaxScratchMB()) << 20);
            OfficeToPdf.Result result;
            try {
                result = converter.convert(in, out, options);
            } catch (OfficeToPdf.TimedOut e) {
                throw timedOut(e);
            } catch (OfficeToPdf.OutputTooLarge e) {
                throw new Unconverted(
                        HttpStatus.CONTENT_TOO_LARGE,
                        "The PDF would be larger than the "
                                + settings.getMaxScratchMB()
                                + " MB limit for converting Office files to PDF",
                        e,
                        false);
            } catch (IOException | RuntimeException e) {
                if (stoppedForMemory(e)) {
                    throw needsMemory(e);
                }
                if (e instanceof OfficeZip.Oversized) {
                    throw new Unconverted(HttpStatus.CONTENT_TOO_LARGE, reason(e), e, false);
                }
                if (e instanceof InterruptedIOException) {
                    throw e;
                }
                throw new Unconverted(HttpStatus.UNPROCESSABLE_ENTITY, reason(e), e, true);
            }
            checkComplete(result, options.maxPages());
            return result;
        } finally {
            slots.release();
        }
    }

    private void acquire(long deadline) throws InterruptedIOException {
        if (slots.tryAcquire()) {
            return;
        }
        if (queued.incrementAndGet() > maxQueued) {
            queued.decrementAndGet();
            throw busy();
        }
        try {
            if (!slots.tryAcquire(deadline - System.nanoTime(), TimeUnit.NANOSECONDS)) {
                throw busy();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            InterruptedIOException stopped =
                    new InterruptedIOException("Interrupted while waiting to convert");
            stopped.initCause(e);
            throw stopped;
        } finally {
            queued.decrementAndGet();
        }
    }

    /** The page limit is final, as LibreOffice has none; lost content is worth a retry. */
    private static void checkComplete(OfficeToPdf.Result result, int maxPages) throws Unconverted {
        if (result.pageLimitReached()) {
            throw new Unconverted(
                    HttpStatus.CONTENT_TOO_LARGE,
                    "The document has more than "
                            + maxPages
                            + " pages, the limit for converting Office files to PDF",
                    null,
                    false);
        }
        if (!result.truncated()) {
            return;
        }
        List<String> warnings = result.warnings();
        throw new Unconverted(
                HttpStatus.UNPROCESSABLE_ENTITY,
                warnings.isEmpty() ? "The document was only partly converted" : warnings.get(0),
                null,
                true);
    }

    private ResponseStatusException timedOut(Throwable cause) {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "The conversion did not finish within the time limit of "
                        + budget.toSeconds()
                        + " seconds and was stopped",
                cause);
    }

    private static ResponseStatusException busy() {
        return new Busy(
                "The server is busy converting other Office files; try again shortly", null);
    }

    /**
     * Whether Stirling Office Convert stopped a conversion, either direction, for lack of memory.
     */
    static boolean stoppedForMemory(Throwable e) {
        int depth = 0;
        for (Throwable t = e; t != null && depth++ < 16; t = t.getCause()) {
            if (t instanceof Admission.Stopped
                    || t instanceof RenderJob.OutOfMemory
                    || t instanceof OutOfMemoryError) {
                return true;
            }
        }
        return false;
    }

    /** A memory stop is load shedding: LibreOffice would need more memory, so never fall back. */
    static ResponseStatusException needsMemory(Throwable cause) {
        return new Busy(Admission.NEEDS_MEMORY + "; try again shortly", cause);
    }

    static String reason(Throwable e) {
        String message = e.getMessage();
        if (message == null || message.isBlank()) {
            return "The document could not be converted to PDF";
        }
        if (message.contains("jdk.xml.")) {
            return "The document is nested too deeply or holds too much text in one part to convert";
        }
        return message;
    }

    /** Sanitizing leaves an empty zip of a non-zip file; LibreOffice would render it as text. */
    private static boolean isEmptyPackage(Path file) {
        try (ZipFile zip = new ZipFile(file.toFile())) {
            return zip.size() == 0;
        } catch (IOException e) {
            return true;
        }
    }

    private static String extensionOf(Path file) {
        String name = file.getFileName().toString();
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** A load-shedding refusal; the client should retry after a short wait. */
    static final class Busy extends ResponseStatusException {
        private final HttpHeaders headers = new HttpHeaders();

        Busy(String reason, Throwable cause) {
            super(HttpStatus.SERVICE_UNAVAILABLE, reason, cause);
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(RETRY_AFTER_SECONDS));
        }

        @Override
        public HttpHeaders getHeaders() {
            return headers;
        }
    }

    /** A file the in-process converter refused or failed on; LibreOffice may take it if retry. */
    static final class Unconverted extends Exception {
        private final HttpStatus status;
        private final boolean retry;

        Unconverted(HttpStatus status, String message, Throwable cause, boolean retry) {
            super(message, cause);
            this.status = status;
            this.retry = retry;
        }

        HttpStatus status() {
            return status;
        }

        boolean retry() {
            return retry;
        }

        ResponseStatusException toResponse() {
            return new ResponseStatusException(status, getMessage(), getCause());
        }
    }
}
