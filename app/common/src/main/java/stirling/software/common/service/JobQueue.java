package stirling.software.common.service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExecutorFactory;
import stirling.software.common.util.SpringContextHolder;

/**
 * Manages a queue of jobs with dynamic sizing based on system resources. Used when system resources
 * are limited to prevent overloading.
 */
@Service
@Slf4j
public class JobQueue implements SmartLifecycle {

    private volatile boolean running = false;

    private final ResourceMonitor resourceMonitor;

    @Value("${stirling.job.queue.base-capacity:10}")
    private int baseQueueCapacity = 10;

    @Value("${stirling.job.queue.min-capacity:2}")
    private int minQueueCapacity = 2;

    @Value("${stirling.job.queue.check-interval-ms:1000}")
    private long queueCheckIntervalMs = 1000;

    @Value("${stirling.job.queue.max-wait-time-ms:600000}")
    private long maxWaitTimeMs = 600000; // 10 minutes

    private volatile BlockingQueue<QueuedJob> jobQueue;
    private final Map<String, QueuedJob> jobMap = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService jobExecutor = ExecutorFactory.newVirtualOrCachedThreadExecutor();
    private final Object queueLock = new Object(); // Lock for synchronizing queue operations

    private boolean shuttingDown = false;

    @Getter private int rejectedJobs = 0;

    @Getter private int totalQueuedJobs = 0;

    @Getter private int currentQueueSize = 0;

    /** Represents a job waiting in the queue. */
    @Data
    @AllArgsConstructor
    private static class QueuedJob {
        private final String jobId;
        private final int resourceWeight;
        private final Supplier<Object> work;
        private final long timeoutMs;
        private final Instant queuedAt;
        private CompletableFuture<ResponseEntity<?>> future;
        private volatile boolean cancelled = false;
    }

    public JobQueue(ResourceMonitor resourceMonitor) {
        this.resourceMonitor = resourceMonitor;

        // Initialize with dynamic capacity
        int capacity =
                resourceMonitor.calculateDynamicQueueCapacity(baseQueueCapacity, minQueueCapacity);
        this.jobQueue = new LinkedBlockingQueue<>(capacity);
    }

    // Remove @PostConstruct to let SmartLifecycle control startup
    private void initializeSchedulers() {
        log.debug(
                "Starting job queue with base capacity {}, min capacity {}",
                baseQueueCapacity,
                minQueueCapacity);

        // Periodically process the job queue
        scheduler.scheduleWithFixedDelay(
                this::processQueue, 0, queueCheckIntervalMs, TimeUnit.MILLISECONDS);

        // Periodically update queue capacity based on resource usage
        scheduler.scheduleWithFixedDelay(
                this::updateQueueCapacity,
                10000, // Initial delay
                30000, // 30 second interval
                TimeUnit.MILLISECONDS);
    }

    // Remove @PreDestroy to let SmartLifecycle control shutdown
    private void shutdownSchedulers() {
        log.info("Shutting down job queue");
        shuttingDown = true;

        // Complete any futures that are still waiting
        jobMap.forEach(
                (id, job) -> {
                    if (!job.future.isDone()) {
                        job.future.completeExceptionally(
                                new RuntimeException("Server shutting down, job cancelled"));
                    }
                });

        // Shutdown schedulers and wait for termination
        try {
            scheduler.shutdown();
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }

            jobExecutor.shutdown();
            if (!jobExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                jobExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            scheduler.shutdownNow();
            jobExecutor.shutdownNow();
        }

        log.info(
                "Job queue shutdown complete. Stats: total={}, rejected={}",
                totalQueuedJobs,
                rejectedJobs);
    }

    // SmartLifecycle methods

    @Override
    public void start() {
        log.info("Starting JobQueue lifecycle");
        if (!running) {
            initializeSchedulers();
            running = true;
        }
    }

    @Override
    public void stop() {
        log.info("Stopping JobQueue lifecycle");
        shutdownSchedulers();
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        // Start earlier than most components, but shutdown later
        return 10;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    /**
     * Queues a job for execution when resources permit.
     *
     * @param jobId The job ID
     * @param resourceWeight The resource weight of the job (1-100)
     * @param work The work to be done
     * @param timeoutMs The timeout in milliseconds
     * @return A CompletableFuture that will complete when the job is executed
     */
    public CompletableFuture<ResponseEntity<?>> queueJob(
            String jobId, int resourceWeight, Supplier<Object> work, long timeoutMs) {

        // Create a CompletableFuture to track this job's completion
        CompletableFuture<ResponseEntity<?>> future = new CompletableFuture<>();

        // Create the queued job
        QueuedJob job =
                new QueuedJob(jobId, resourceWeight, work, timeoutMs, Instant.now(), future, false);

        // Store in our map for lookup
        jobMap.put(jobId, job);

        // Update stats
        totalQueuedJobs++;

        // Synchronize access to the queue
        synchronized (queueLock) {
            currentQueueSize = jobQueue.size();

            // Try to add to the queue
            try {
                boolean added = jobQueue.offer(job, 5, TimeUnit.SECONDS);
                if (!added) {
                    log.warn("Queue full, rejecting job {}", jobId);
                    rejectedJobs++;
                    future.completeExceptionally(
                            new RuntimeException("Job queue full, please try again later"));
                    jobMap.remove(jobId);
                    return future;
                }

                log.debug(
                        "Job {} queued for execution (weight: {}, queue size: {})",
                        jobId,
                        resourceWeight,
                        jobQueue.size());

                return future;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                future.completeExceptionally(new RuntimeException("Job queue interrupted"));
                jobMap.remove(jobId);
                return future;
            }
        }
    }

    /**
     * Gets the current capacity of the job queue.
     *
     * @return The current capacity
     */
    public int getQueueCapacity() {
        synchronized (queueLock) {
            return ((LinkedBlockingQueue<QueuedJob>) jobQueue).remainingCapacity()
                    + jobQueue.size();
        }
    }

    /** Updates the capacity of the job queue based on available system resources. */
    private void updateQueueCapacity() {
        try {
            // Calculate new capacity once and cache the result
            int newCapacity =
                    resourceMonitor.calculateDynamicQueueCapacity(
                            baseQueueCapacity, minQueueCapacity);

            int currentCapacity = getQueueCapacity();
            if (newCapacity != currentCapacity) {
                log.debug(
                        "Updating job queue capacity from {} to {}", currentCapacity, newCapacity);

                synchronized (queueLock) {
                    // Double-check that capacity still needs to be updated
                    // Use the cached currentCapacity to avoid calling getQueueCapacity() again
                    if (newCapacity != currentCapacity) {
                        // Create new queue with updated capacity
                        BlockingQueue<QueuedJob> newQueue = new LinkedBlockingQueue<>(newCapacity);

                        // Transfer jobs from old queue to new queue
                        jobQueue.drainTo(newQueue);
                        jobQueue = newQueue;

                        currentQueueSize = jobQueue.size();
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error updating queue capacity: {}", e.getMessage(), e);
        }
    }

    /** Processes jobs in the queue, executing them when resources permit. */
    private void processQueue() {
        // Jobs to execute after releasing the lock
        java.util.List<QueuedJob> jobsToExecute = new java.util.ArrayList<>();

        // First synchronized block: poll jobs from the queue and prepare them for execution
        synchronized (queueLock) {
            if (shuttingDown || jobQueue.isEmpty()) {
                return;
            }

            try {
                // Get current resource status
                ResourceMonitor.ResourceStatus status = resourceMonitor.getCurrentStatus().get();

                // Check if we should execute any jobs
                boolean canExecuteJobs = (status != ResourceMonitor.ResourceStatus.CRITICAL);

                if (!canExecuteJobs) {
                    // Under critical load, don't execute any jobs
                    log.debug("System under critical load, delaying job execution");
                    return;
                }

                // Get jobs from the queue, up to a limit based on resource availability
                int jobsToProcess =
                        Math.max(
                                1,
                                switch (status) {
                                    case OK -> 3;
                                    case WARNING -> 1;
                                    case CRITICAL -> 0;
                                });

                for (int i = 0; i < jobsToProcess && !jobQueue.isEmpty(); i++) {
                    QueuedJob job = jobQueue.poll();
                    if (job == null) break;

                    // Check if it's been waiting too long
                    long waitTimeMs = Instant.now().toEpochMilli() - job.queuedAt.toEpochMilli();
                    if (waitTimeMs > maxWaitTimeMs) {
                        log.warn(
                                "Job {} exceeded maximum wait time ({} ms), executing anyway",
                                job.jobId,
                                waitTimeMs);

                        // Add a specific status to the job context that can be tracked
                        // This will be visible in the job status API
                        try {
                            TaskManager taskManager =
                                    SpringContextHolder.getBean(TaskManager.class);
                            if (taskManager != null) {
                                taskManager.addNote(
                                        job.jobId,
                                        "QUEUED_TIMEOUT: Job waited in queue for "
                                                + (waitTimeMs / 1000)
                                                + " seconds, exceeding the maximum wait time of "
                                                + (maxWaitTimeMs / 1000)
                                                + " seconds.");
                            }
                        } catch (Exception e) {
                            log.error(
                                    "Failed to add timeout note to job {}: {}",
                                    job.jobId,
                                    e.getMessage());
                        }
                    }

                    // Remove from our map
                    jobMap.remove(job.jobId);
                    currentQueueSize = jobQueue.size();

                    // Add to the list of jobs to execute outside the synchronized block
                    jobsToExecute.add(job);
                }
            } catch (Exception e) {
                log.error("Error processing job queue: {}", e.getMessage(), e);
            }
        }

        // Now execute the jobs outside the synchronized block to avoid holding the lock
        for (QueuedJob job : jobsToExecute) {
            executeJob(job);
        }
    }

    /**
     * Executes a job from the queue.
     *
     * @param job The job to execute
     */
    private void executeJob(QueuedJob job) {
        if (job.cancelled) {
            log.debug("Job {} was cancelled, not executing", job.jobId);
            return;
        }

        jobExecutor.execute(
                () -> {
                    log.debug("Executing queued job {} (queued at {})", job.jobId, job.queuedAt);

                    try {
                        // Execute with timeout
                        Object result = executeWithTimeout(job.work, job.timeoutMs);

                        // Process the result
                        if (result instanceof ResponseEntity) {
                            job.future.complete((ResponseEntity<?>) result);
                        } else {
                            job.future.complete(ResponseEntity.ok(result));
                        }

                    } catch (Exception e) {
                        log.error(
                                "Error executing queued job {}: {}", job.jobId, e.getMessage(), e);
                        job.future.completeExceptionally(e);
                    }
                });
    }

    /**
     * Execute a supplier with a timeout.
     *
     * @param supplier The supplier to execute
     * @param timeoutMs The timeout in milliseconds
     * @return The result from the supplier
     * @throws Exception If there is an execution error
     */
    private <T> T executeWithTimeout(Supplier<T> supplier, long timeoutMs) throws Exception {
        CompletableFuture<T> future = CompletableFuture.supplyAsync(supplier);

        try {
            if (timeoutMs <= 0) {
                // No timeout
                return future.join();
            } else {
                // With timeout
                return future.get(timeoutMs, TimeUnit.MILLISECONDS);
            }
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new TimeoutException("Job timed out after " + timeoutMs + "ms");
        } catch (ExecutionException e) {
            throw (Exception) e.getCause();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new InterruptedException("Job was interrupted");
        }
    }

    /**
     * Checks if a job is queued.
     *
     * @param jobId The job ID
     * @return true if the job is queued
     */
    public boolean isJobQueued(String jobId) {
        return jobMap.containsKey(jobId);
    }

    /**
     * Gets the current position of a job in the queue.
     *
     * @param jobId The job ID
     * @return The position (0-based) or -1 if not found
     */
    public int getJobPosition(String jobId) {
        if (!jobMap.containsKey(jobId)) {
            return -1;
        }

        // Count positions
        int position = 0;
        for (QueuedJob job : jobQueue) {
            if (job.jobId.equals(jobId)) {
                return position;
            }
            position++;
        }

        // If we didn't find it in the queue but it's in the map,
        // it might be executing already
        return -1;
    }

    /**
     * Cancels a queued job.
     *
     * @param jobId The job ID
     * @return true if the job was cancelled, false if not found
     */
    public boolean cancelJob(String jobId) {
        QueuedJob job = jobMap.remove(jobId);
        if (job != null) {
            job.cancelled = true;
            job.future.completeExceptionally(new RuntimeException("Job cancelled by user"));

            // Try to remove from queue if it's still there
            jobQueue.remove(job);
            currentQueueSize = jobQueue.size();

            log.debug("Job {} cancelled", jobId);

            return true;
        }

        return false;
    }

    /**
     * Get queue statistics.
     *
     * @return A map containing queue statistics
     */
    public Map<String, Object> getQueueStats() {
        return Map.of(
                "queuedJobs", jobQueue.size(),
                "queueCapacity", getQueueCapacity(),
                "totalQueuedJobs", totalQueuedJobs,
                "rejectedJobs", rejectedJobs,
                "resourceStatus", resourceMonitor.getCurrentStatus().get().name());
    }
}
