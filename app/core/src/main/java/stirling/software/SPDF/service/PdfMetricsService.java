package stirling.software.SPDF.service;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Service;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.scheduling.LazyScheduledTask;
import stirling.software.common.service.PostHogService;

@Service
public class PdfMetricsService {

    private final PostHogService postHogService;
    private final ApplicationProperties applicationProperties;
    private final LazyScheduledTask flushTask;

    private final AtomicLong operations = new AtomicLong();
    private final AtomicLong pdfs = new AtomicLong();
    private long lastOperations;
    private long lastPdfs;

    public PdfMetricsService(
            PostHogService postHogService,
            ApplicationProperties applicationProperties,
            TaskScheduler scheduler) {
        this.postHogService = postHogService;
        this.applicationProperties = applicationProperties;
        this.flushTask = new LazyScheduledTask(scheduler, this::flushMetrics);
    }

    public boolean isEnabled() {
        return applicationProperties.getSystem().isPosthogEnabled();
    }

    public void recordOperation(int pdfCount) {
        if (!isEnabled()) {
            return;
        }
        flushTask.ensureFixedRate(Duration.ofHours(2));
        operations.incrementAndGet();
        if (pdfCount > 0) {
            pdfs.addAndGet(pdfCount);
        }
    }

    /** Flushes the deltas to PostHog; armed by the first recorded operation. */
    public void flushMetrics() {
        if (!isEnabled()) {
            return;
        }
        long curOps = operations.get();
        long curPdfs = pdfs.get();
        long opsDelta = curOps - lastOperations;
        long pdfsDelta = curPdfs - lastPdfs;
        if (opsDelta <= 0 && pdfsDelta <= 0) {
            return;
        }

        Map<String, Object> props = new HashMap<>();
        props.put("source", "api");
        props.put("operations", opsDelta);
        props.put("pdfs", pdfsDelta);
        postHogService.captureEvent("pdf_operation_metrics", props);

        lastOperations = curOps;
        lastPdfs = curPdfs;
    }
}
