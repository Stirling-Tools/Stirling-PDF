package stirling.software.common.service;



import java.lang.management.MemoryMXBean;
import java.lang.management.OperatingSystemMXBean;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("ResourceMonitor Tests")
class ResourceMonitorTest {

    @InjectMocks
    private ResourceMonitor resourceMonitor;

    @Mock
    private OperatingSystemMXBean osMXBean;

    @Mock
    private MemoryMXBean memoryMXBean;

    @Spy
    private AtomicReference<ResourceStatus> currentStatus = new AtomicReference<>(ResourceStatus.OK);

    @Spy
    private AtomicReference<ResourceMetrics> latestMetrics = new AtomicReference<>(new ResourceMetrics());

    @BeforeEach
    void setUp() {
        // Inject test-specific threshold values and mocked beans into resourceMonitor
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
    @DisplayName("calculateDynamicQueueCapacity returns adjusted capacities based on resource status")
    void shouldCalculateDynamicQueueCapacity() {
        int baseCapacity = 10;
        int minCapacity = 2;

        // When status is OK
        currentStatus.set(ResourceStatus.OK);
        int capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);
        assertEquals(baseCapacity, capacity, "Capacity should match base capacity when status is OK");

        // When status is WARNING
        currentStatus.set(ResourceStatus.WARNING);
        capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);
        assertEquals(6, capacity, "Capacity should be 60% of base capacity when status is WARNING");

        // When status is CRITICAL
        currentStatus.set(ResourceStatus.CRITICAL);
        capacity = resourceMonitor.calculateDynamicQueueCapacity(baseCapacity, minCapacity);
        assertEquals(3, capacity, "Capacity should be 30% of base capacity when status is CRITICAL");

        // Capacity should not go below minimum capacity
        int smallBase = 1;
        capacity = resourceMonitor.calculateDynamicQueueCapacity(smallBase, minCapacity);
        assertEquals(minCapacity, capacity, "Capacity should not be below minimum capacity");
    }

    @ParameterizedTest(name = "Job weight: {0}, Status: {1} -> shouldQueue: {2}")
    @CsvSource({
        "10, OK, false",      // Light job, OK status
        "10, WARNING, false", // Light job, WARNING status
        "10, CRITICAL, true", // Light job, CRITICAL status
        "30, OK, false",      // Medium job, OK status
        "30, WARNING, true",  // Medium job, WARNING status
        "30, CRITICAL, true", // Medium job, CRITICAL status
        "80, OK, true",       // Heavy job, OK status
        "80, WARNING, true",  // Heavy job, WARNING status
        "80, CRITICAL, true"  // Heavy job, CRITICAL status
    })
    @DisplayName("shouldQueueJob correctly determines queuing based on weight and resource status")
    void shouldQueueJobBasedOnWeightAndStatus(int jobWeight, ResourceStatus status, boolean expected) {
        currentStatus.set(status);
        boolean actual = resourceMonitor.shouldQueueJob(jobWeight);
        assertEquals(expected, actual,
            () -> String.format(
                "Expected shouldQueue=%s for jobWeight=%d and status=%s",
                expected, jobWeight, status));
    }

    @Test
    @DisplayName("ResourceMetrics correctly identifies stale state based on age")
    void resourceMetricsShouldDetectStaleState() {
        Instant now = Instant.now();
        Instant staleTime = now.minusMillis(6000);
        ResourceMetrics staleMetrics = new ResourceMetrics(0.5, 0.5, 1024, 2048, 4096, staleTime);
        ResourceMetrics freshMetrics = new ResourceMetrics(0.5, 0.5, 1024, 2048, 4096, now);

        assertTrue(staleMetrics.isStale(5000), "Metrics timestamp older than threshold should be stale");
        assertFalse(freshMetrics.isStale(5000), "Recent metrics should not be stale");
    }
}
