package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.service.ResourceMonitor.ResourceMetrics;
import stirling.software.common.service.ResourceMonitor.ResourceStatus;

@ExtendWith(MockitoExtension.class)
class ResourceMonitorTest {

    @InjectMocks private ResourceMonitor resourceMonitor;

    @Mock private OperatingSystemMXBean osMXBean;

    @Mock private MemoryMXBean memoryMXBean;

    @Spy
    private AtomicReference<ResourceStatus> currentStatus =
            new AtomicReference<>(ResourceStatus.OK);

    @Spy
    private AtomicReference<ResourceMetrics> latestMetrics =
            new AtomicReference<>(new ResourceMetrics());

    @BeforeEach
    void setUp() {
        // Set thresholds for testing
        ReflectionTestUtils.setField(resourceMonitor, "memoryCriticalThreshold", 0.9);
        ReflectionTestUtils.setField(resourceMonitor, "memoryHighThreshold", 0.75);
        ReflectionTestUtils.setField(resourceMonitor, "cpuCriticalThreshold", 0.9);
        ReflectionTestUtils.setField(resourceMonitor, "cpuHighThreshold", 0.75);
        ReflectionTestUtils.setField(resourceMonitor, "osMXBean", osMXBean);
        ReflectionTestUtils.setField(resourceMonitor, "memoryMXBean", memoryMXBean);
        ReflectionTestUtils.setField(resourceMonitor, "currentStatus", currentStatus);
        ReflectionTestUtils.setField(resourceMonitor, "latestMetrics", latestMetrics);
    }

    @Test
    void shouldCalculateDynamicQueueCapacity() {
        // Given
        int baseCapacity = 10;
        int minCapacity = 2;

        // Mock current status as OK
        currentStatus.set(ResourceStatus.OK);

        // When
        int capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);

        // Then
        assertEquals(baseCapacity, capacity, "With OK status, capacity should equal base capacity");

        // Given
        currentStatus.set(ResourceStatus.WARNING);

        // When
        capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);

        // Then
        assertEquals(6, capacity, "With WARNING status, capacity should be reduced to 60%");

        // Given
        currentStatus.set(ResourceStatus.CRITICAL);

        // When
        capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);

        // Then
        assertEquals(3, capacity, "With CRITICAL status, capacity should be reduced to 30%");

        // Test minimum capacity enforcement
        assertEquals(
                minCapacity,
                resourceMonitor.calculateDynamicQueueCapacity(1, minCapacity),
                "Should never go below minimum capacity");
    }

    @ParameterizedTest
    @CsvSource({
        "10, OK, false", // Light job, OK status
        "10, WARNING, false", // Light job, WARNING status
        "10, CRITICAL, true", // Light job, CRITICAL status
        "30, OK, false", // Medium job, OK status
        "30, WARNING, true", // Medium job, WARNING status
        "30, CRITICAL, true", // Medium job, CRITICAL status
        "80, OK, true", // Heavy job, OK status
        "80, WARNING, true", // Heavy job, WARNING status
        "80, CRITICAL, true" // Heavy job, CRITICAL status
    })
    void shouldQueueJobBasedOnWeightAndStatus(
            int weight, ResourceStatus status, boolean shouldQueue) {
        // Given
        currentStatus.set(status);

        // When
        boolean result = resourceMonitor.shouldQueueJob(weight);

        // Then
        assertEquals(
                shouldQueue,
                result,
                String.format(
                        "For weight %d and status %s, shouldQueue should be %s",
                        weight, status, shouldQueue));
    }

    @Test
    void resourceMetricsShouldDetectStaleState() {
        // Given
        Instant now = Instant.now();
        Instant pastInstant = now.minusMillis(6000);

        ResourceMetrics staleMetrics = new ResourceMetrics(0.5, 0.5, 1024, 2048, 4096, pastInstant);
        ResourceMetrics freshMetrics = new ResourceMetrics(0.5, 0.5, 1024, 2048, 4096, now);

        // When/Then
        assertTrue(
                staleMetrics.isStale(5000),
                "Metrics from 6 seconds ago should be stale with 5s threshold");
        assertFalse(freshMetrics.isStale(5000), "Fresh metrics should not be stale");
    }
}
