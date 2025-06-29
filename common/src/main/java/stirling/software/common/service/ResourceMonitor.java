package stirling.software.common.service;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Monitors system resources (CPU, memory) to inform job scheduling decisions. Provides information
 * about available resources to prevent overloading the system.
 */
@Service
@Slf4j
public class ResourceMonitor {

    @Value("${stirling.resource.memory.critical-threshold:0.9}")
    private double memoryCriticalThreshold = 0.9; // 90% usage is critical

    @Value("${stirling.resource.memory.high-threshold:0.75}")
    private double memoryHighThreshold = 0.75; // 75% usage is high

    @Value("${stirling.resource.cpu.critical-threshold:0.9}")
    private double cpuCriticalThreshold = 0.9; // 90% usage is critical

    @Value("${stirling.resource.cpu.high-threshold:0.75}")
    private double cpuHighThreshold = 0.75; // 75% usage is high

    @Value("${stirling.resource.monitor.interval-ms:60000}")
    private long monitorIntervalMs = 60000; // 60 seconds

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private final MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();
    private final OperatingSystemMXBean osMXBean = ManagementFactory.getOperatingSystemMXBean();

    @Getter
    private final AtomicReference<ResourceStatus> currentStatus =
            new AtomicReference<>(ResourceStatus.OK);

    @Getter
    private final AtomicReference<ResourceMetrics> latestMetrics =
            new AtomicReference<>(new ResourceMetrics());

    /** Represents the current status of system resources. */
    public enum ResourceStatus {
        /** Resources are available, normal operations can proceed */
        OK,

        /** Resources are under strain, consider queueing high-resource operations */
        WARNING,

        /** Resources are critically low, queue all operations */
        CRITICAL
    }

    /** Detailed metrics about system resources. */
    @Getter
    public static class ResourceMetrics {
        private final double cpuUsage;
        private final double memoryUsage;
        private final long freeMemoryBytes;
        private final long totalMemoryBytes;
        private final long maxMemoryBytes;
        private final Instant timestamp;

        public ResourceMetrics() {
            this(0, 0, 0, 0, 0, Instant.now());
        }

        public ResourceMetrics(
                double cpuUsage,
                double memoryUsage,
                long freeMemoryBytes,
                long totalMemoryBytes,
                long maxMemoryBytes,
                Instant timestamp) {
            this.cpuUsage = cpuUsage;
            this.memoryUsage = memoryUsage;
            this.freeMemoryBytes = freeMemoryBytes;
            this.totalMemoryBytes = totalMemoryBytes;
            this.maxMemoryBytes = maxMemoryBytes;
            this.timestamp = timestamp;
        }

        /**
         * Gets the age of these metrics.
         *
         * @return Duration since these metrics were collected
         */
        public Duration getAge() {
            return Duration.between(timestamp, Instant.now());
        }

        /**
         * Check if these metrics are stale (older than threshold).
         *
         * @param thresholdMs Staleness threshold in milliseconds
         * @return true if metrics are stale
         */
        public boolean isStale(long thresholdMs) {
            return getAge().toMillis() > thresholdMs;
        }
    }

    @PostConstruct
    public void initialize() {
        log.debug("Starting resource monitoring with interval of {}ms", monitorIntervalMs);
        scheduler.scheduleAtFixedRate(
                this::updateResourceMetrics, 0, monitorIntervalMs, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down resource monitoring");
        scheduler.shutdownNow();
    }

    /** Updates the resource metrics by sampling current system state. */
    private void updateResourceMetrics() {
        try {
            // Get CPU usage
            double cpuUsage = osMXBean.getSystemLoadAverage() / osMXBean.getAvailableProcessors();
            if (cpuUsage < 0) cpuUsage = getAlternativeCpuLoad(); // Fallback if not available

            // Get memory usage
            long heapUsed = memoryMXBean.getHeapMemoryUsage().getUsed();
            long nonHeapUsed = memoryMXBean.getNonHeapMemoryUsage().getUsed();
            long totalUsed = heapUsed + nonHeapUsed;

            long maxMemory = Runtime.getRuntime().maxMemory();
            long totalMemory = Runtime.getRuntime().totalMemory();
            long freeMemory = Runtime.getRuntime().freeMemory();

            double memoryUsage = (double) totalUsed / maxMemory;

            // Create new metrics
            ResourceMetrics metrics =
                    new ResourceMetrics(
                            cpuUsage,
                            memoryUsage,
                            freeMemory,
                            totalMemory,
                            maxMemory,
                            Instant.now());
            latestMetrics.set(metrics);

            // Determine system status
            ResourceStatus newStatus;
            if (cpuUsage > cpuCriticalThreshold || memoryUsage > memoryCriticalThreshold) {
                newStatus = ResourceStatus.CRITICAL;
            } else if (cpuUsage > cpuHighThreshold || memoryUsage > memoryHighThreshold) {
                newStatus = ResourceStatus.WARNING;
            } else {
                newStatus = ResourceStatus.OK;
            }

            // Update status if it changed
            ResourceStatus oldStatus = currentStatus.getAndSet(newStatus);
            if (oldStatus != newStatus) {
                log.info("System resource status changed from {} to {}", oldStatus, newStatus);
                log.info(
                        "Current metrics - CPU: {}%, Memory: {}%, Free Memory: {} MB",
                        String.format("%.1f", cpuUsage * 100),
                        String.format("%.1f", memoryUsage * 100),
                        freeMemory / (1024 * 1024));
            }
        } catch (Exception e) {
            log.error("Error updating resource metrics: {}", e.getMessage(), e);
        }
    }

    /**
     * Alternative method to estimate CPU load if getSystemLoadAverage() is not available. This is a
     * fallback and less accurate than the official JMX method.
     *
     * @return Estimated CPU load as a value between 0.0 and 1.0
     */
    private double getAlternativeCpuLoad() {
        try {
            // Try to get CPU time if available through reflection
            // This is a fallback since we can't directly cast to platform-specific classes
            try {
                java.lang.reflect.Method m =
                        osMXBean.getClass().getDeclaredMethod("getProcessCpuLoad");
                m.setAccessible(true);
                return (double) m.invoke(osMXBean);
            } catch (Exception e) {
                // Try the older method
                try {
                    java.lang.reflect.Method m =
                            osMXBean.getClass().getDeclaredMethod("getSystemCpuLoad");
                    m.setAccessible(true);
                    return (double) m.invoke(osMXBean);
                } catch (Exception e2) {
                    log.trace(
                            "Could not get CPU load through reflection, assuming moderate load (0.5)");
                    return 0.5;
                }
            }
        } catch (Exception e) {
            log.trace("Could not get CPU load, assuming moderate load (0.5)");
            return 0.5; // Default to moderate load
        }
    }

    /**
     * Calculates the dynamic job queue capacity based on current resource usage.
     *
     * @param baseCapacity The base capacity when system is under minimal load
     * @param minCapacity The minimum capacity to maintain even under high load
     * @return The calculated job queue capacity
     */
    public int calculateDynamicQueueCapacity(int baseCapacity, int minCapacity) {
        ResourceMetrics metrics = latestMetrics.get();
        ResourceStatus status = currentStatus.get();

        // Simple linear reduction based on memory and CPU load
        double capacityFactor =
                switch (status) {
                    case OK -> 1.0;
                    case WARNING -> 0.6;
                    case CRITICAL -> 0.3;
                };

        // Apply additional reduction based on specific memory pressure
        if (metrics.memoryUsage > 0.8) {
            capacityFactor *= 0.5; // Further reduce capacity under memory pressure
        }

        // Calculate capacity with minimum safeguard
        int capacity = (int) Math.max(minCapacity, Math.ceil(baseCapacity * capacityFactor));

        log.debug(
                "Dynamic queue capacity: {} (base: {}, factor: {:.2f}, status: {})",
                capacity,
                baseCapacity,
                capacityFactor,
                status);

        return capacity;
    }

    /**
     * Checks if a job with the given weight can be executed immediately or should be queued based
     * on current resource availability.
     *
     * @param resourceWeight The resource weight of the job (1-100)
     * @return true if the job should be queued, false if it can run immediately
     */
    public boolean shouldQueueJob(int resourceWeight) {
        ResourceStatus status = currentStatus.get();

        // Always run lightweight jobs (weight < 20) unless critical
        if (resourceWeight < 20 && status != ResourceStatus.CRITICAL) {
            return false;
        }

        // Medium weight jobs run immediately if resources are OK
        if (resourceWeight < 60 && status == ResourceStatus.OK) {
            return false;
        }

        // Heavy jobs (weight >= 60) and any job during WARNING/CRITICAL should be queued
        return true;
    }
}
