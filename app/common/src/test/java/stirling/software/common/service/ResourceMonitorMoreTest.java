package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.time.Instant;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import com.sun.management.OperatingSystemMXBean;

import stirling.software.common.service.ResourceMonitor.ResourceMetrics;
import stirling.software.common.service.ResourceMonitor.ResourceStatus;

/** Additional coverage for ResourceMonitor branches not exercised by ResourceMonitorTest. */
@ExtendWith(MockitoExtension.class)
class ResourceMonitorMoreTest {

    private ResourceMonitor resourceMonitor;

    @Mock private OperatingSystemMXBean osMXBean;
    @Mock private MemoryMXBean memoryMXBean;
    @Mock private MemoryUsage heapUsage;
    @Mock private MemoryUsage nonHeapUsage;

    private final AtomicReference<ResourceStatus> currentStatus =
            new AtomicReference<>(ResourceStatus.OK);
    private final AtomicReference<ResourceMetrics> latestMetrics =
            new AtomicReference<>(new ResourceMetrics());

    @BeforeEach
    void setUp() {
        resourceMonitor = new ResourceMonitor();
        ReflectionTestUtils.setField(resourceMonitor, "memoryCriticalThreshold", 0.9);
        ReflectionTestUtils.setField(resourceMonitor, "memoryHighThreshold", 0.75);
        ReflectionTestUtils.setField(resourceMonitor, "cpuCriticalThreshold", 0.9);
        ReflectionTestUtils.setField(resourceMonitor, "cpuHighThreshold", 0.75);
        ReflectionTestUtils.setField(resourceMonitor, "osMXBean", osMXBean);
        ReflectionTestUtils.setField(resourceMonitor, "memoryMXBean", memoryMXBean);
        ReflectionTestUtils.setField(resourceMonitor, "currentStatus", currentStatus);
        ReflectionTestUtils.setField(resourceMonitor, "latestMetrics", latestMetrics);
    }

    private void stubMemory(long heapUsed, long nonHeapUsed) {
        lenient().when(heapUsage.getUsed()).thenReturn(heapUsed);
        lenient().when(nonHeapUsage.getUsed()).thenReturn(nonHeapUsed);
        lenient().when(memoryMXBean.getHeapMemoryUsage()).thenReturn(heapUsage);
        lenient().when(memoryMXBean.getNonHeapMemoryUsage()).thenReturn(nonHeapUsage);
    }

    @Nested
    @DisplayName("updateResourceMetrics status transitions")
    class UpdateMetrics {

        @ParameterizedTest
        @CsvSource({"0.5, OK", "0.8, WARNING", "0.95, CRITICAL"})
        @DisplayName("CPU utilization drives resource status")
        void statusFollowsCpuUtilization(double cpuUsage, ResourceStatus expectedStatus) {
            when(osMXBean.getCpuLoad()).thenReturn(cpuUsage);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(expectedStatus);
            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(cpuUsage);
        }

        @Test
        @DisplayName("CPU utilization takes precedence over load average")
        void utilizationTakesPrecedenceOverLoadAverage() {
            when(osMXBean.getCpuLoad()).thenReturn(0.2);
            lenient().when(osMXBean.getSystemLoadAverage()).thenReturn(20.0);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(0.2);
        }

        @Test
        @DisplayName("unsupported CPU utilization falls back to bounded load average")
        void unsupportedUtilizationUsesBoundedLoadAverage() {
            when(osMXBean.getCpuLoad()).thenReturn(-1.0);
            when(osMXBean.getSystemLoadAverage()).thenReturn(8.0);
            when(osMXBean.getAvailableProcessors()).thenReturn(2);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(1.0);
            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.CRITICAL);
        }

        @Test
        @DisplayName("invalid CPU samples use the safe default")
        void invalidCpuSamplesUseSafeDefault() {
            when(osMXBean.getCpuLoad()).thenReturn(Double.NaN);
            when(osMXBean.getSystemLoadAverage()).thenReturn(Double.POSITIVE_INFINITY);
            when(osMXBean.getAvailableProcessors()).thenReturn(4);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(0.5);
            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
        }

        @ParameterizedTest
        @CsvSource({"0.8, WARNING", "0.95, CRITICAL"})
        @DisplayName("memory pressure drives status when CPU utilization is low")
        void statusFollowsMemoryPressure(double memoryUsage, ResourceStatus expectedStatus) {
            when(osMXBean.getCpuLoad()).thenReturn(0.1);
            long maxMemory = Runtime.getRuntime().maxMemory();
            stubMemory((long) (maxMemory * memoryUsage), 0L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(expectedStatus);
        }

        @Test
        @DisplayName("an exception while sampling is swallowed and status is unchanged")
        void samplingExceptionSwallowed() {
            when(osMXBean.getCpuLoad()).thenReturn(0.1);
            when(memoryMXBean.getHeapMemoryUsage())
                    .thenThrow(new RuntimeException("jmx unavailable"));
            currentStatus.set(ResourceStatus.OK);

            assertDoesNotThrow(
                    () ->
                            ReflectionTestUtils.invokeMethod(
                                    resourceMonitor, "updateResourceMetrics"));

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
        }
    }

    @Nested
    @DisplayName("calculateDynamicQueueCapacity memory pressure")
    class MemoryPressure {

        @Test
        @DisplayName("high memory usage halves the computed capacity")
        void highMemoryHalvesCapacity() {
            currentStatus.set(ResourceStatus.OK);
            // memoryUsage > 0.8 triggers the additional 0.5 multiplier.
            latestMetrics.set(new ResourceMetrics(0.1, 0.85, 1, 1, 1, Instant.now()));

            int capacity = resourceMonitor.calculateDynamicQueueCapacity(10, 2);
            // OK factor 1.0 * 0.5 = 0.5; ceil(10 * 0.5) = 5.
            assertThat(capacity).isEqualTo(5);
        }
    }

    @Nested
    @DisplayName("ResourceMetrics")
    class Metrics {

        @Test
        @DisplayName("getAge returns a non-negative duration")
        void getAgeNonNegative() {
            ResourceMetrics m = new ResourceMetrics(0, 0, 0, 0, 0, Instant.now().minusSeconds(1));
            assertThat(m.getAge().toMillis()).isGreaterThanOrEqualTo(1000L);
        }
    }

    @Nested
    @DisplayName("lifecycle")
    class Lifecycle {

        @Test
        @DisplayName("initialize schedules sampling and shutdown stops the scheduler")
        void initializeAndShutdown() {
            // Real bean so initialize() schedules against a live virtual-thread scheduler.
            ResourceMonitor live = new ResourceMonitor();
            ReflectionTestUtils.setField(live, "monitorIntervalMs", 60000L);
            live.initialize();

            ScheduledExecutorService scheduler =
                    (ScheduledExecutorService) ReflectionTestUtils.getField(live, "scheduler");
            assertThat(scheduler.isShutdown()).isFalse();

            live.shutdown();
            assertThat(scheduler.isShutdown()).isTrue();
        }
    }
}
