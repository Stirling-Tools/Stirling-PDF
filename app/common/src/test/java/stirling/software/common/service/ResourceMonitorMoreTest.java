package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.lang.management.MemoryMXBean;
import java.lang.management.MemoryUsage;
import java.lang.management.OperatingSystemMXBean;
import java.time.Instant;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

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

        @Test
        @DisplayName("high CPU load drives the status to CRITICAL")
        void criticalOnHighCpu() {
            // load average / processors = 4 / 2 = 2.0 -> well over critical threshold.
            when(osMXBean.getSystemLoadAverage()).thenReturn(4.0);
            when(osMXBean.getAvailableProcessors()).thenReturn(2);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.CRITICAL);
            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(2.0);
        }

        @Test
        @DisplayName("moderately high CPU load drives the status to WARNING")
        void warningOnModerateCpu() {
            // 1.6 / 2 = 0.8 -> above high (0.75) but below critical (0.9).
            when(osMXBean.getSystemLoadAverage()).thenReturn(1.6);
            when(osMXBean.getAvailableProcessors()).thenReturn(2);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.WARNING);
        }

        @Test
        @DisplayName("low load keeps the status at OK")
        void okOnLowLoad() {
            when(osMXBean.getSystemLoadAverage()).thenReturn(0.2);
            when(osMXBean.getAvailableProcessors()).thenReturn(4);
            stubMemory(1L, 1L);
            currentStatus.set(ResourceStatus.WARNING); // ensure a transition log path is hit

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
        }

        @Test
        @DisplayName("a negative load average triggers the alternative CPU fallback")
        void negativeLoadUsesFallback() {
            // getSystemLoadAverage returns -1 on platforms (e.g. Windows) where it is unsupported.
            when(osMXBean.getSystemLoadAverage()).thenReturn(-1.0);
            when(osMXBean.getAvailableProcessors()).thenReturn(4);
            stubMemory(1L, 1L);

            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            // The mock OS bean has no getProcessCpuLoad/getSystemCpuLoad, so fallback yields 0.5.
            assertThat(latestMetrics.get().getCpuUsage()).isEqualTo(0.5);
            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
        }

        @Test
        @DisplayName("an exception while sampling is swallowed and status is unchanged")
        void samplingExceptionSwallowed() {
            when(osMXBean.getSystemLoadAverage()).thenReturn(0.1);
            when(osMXBean.getAvailableProcessors()).thenReturn(2);
            when(memoryMXBean.getHeapMemoryUsage())
                    .thenThrow(new RuntimeException("jmx unavailable"));
            currentStatus.set(ResourceStatus.OK);

            // Must not propagate; the catch in updateResourceMetrics handles it.
            ReflectionTestUtils.invokeMethod(resourceMonitor, "updateResourceMetrics");

            assertThat(currentStatus.get()).isEqualTo(ResourceStatus.OK);
        }
    }

    @Nested
    @DisplayName("getAlternativeCpuLoad")
    class AlternativeCpuLoad {

        @Test
        @DisplayName("uses getProcessCpuLoad via reflection when present")
        void usesProcessCpuLoad() {
            // A bean exposing getProcessCpuLoad lets the reflective fallback return its value.
            OperatingSystemMXBean withCpuLoad = new OsBeanWithProcessCpuLoad(0.42);
            ReflectionTestUtils.setField(resourceMonitor, "osMXBean", withCpuLoad);

            double load =
                    (double)
                            ReflectionTestUtils.invokeMethod(
                                    resourceMonitor, "getAlternativeCpuLoad");
            assertThat(load).isEqualTo(0.42);
        }

        @Test
        @DisplayName("defaults to 0.5 when no CPU-load method is available")
        void defaultsWhenUnavailable() {
            double load =
                    (double)
                            ReflectionTestUtils.invokeMethod(
                                    resourceMonitor, "getAlternativeCpuLoad");
            assertThat(load).isEqualTo(0.5);
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

    /** Minimal OS bean stub exposing getProcessCpuLoad so the reflective fallback can find it. */
    private static class OsBeanWithProcessCpuLoad implements OperatingSystemMXBean {
        private final double cpuLoad;

        OsBeanWithProcessCpuLoad(double cpuLoad) {
            this.cpuLoad = cpuLoad;
        }

        // Reflectively located by getAlternativeCpuLoad.
        public double getProcessCpuLoad() {
            return cpuLoad;
        }

        @Override
        public String getName() {
            return "stub";
        }

        @Override
        public String getArch() {
            return "stub";
        }

        @Override
        public String getVersion() {
            return "stub";
        }

        @Override
        public int getAvailableProcessors() {
            return 1;
        }

        @Override
        public double getSystemLoadAverage() {
            return -1.0;
        }

        @Override
        public javax.management.ObjectName getObjectName() {
            return null;
        }
    }
}
