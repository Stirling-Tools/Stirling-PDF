package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

@DisplayName("TauriProcessMonitor")
class TauriProcessMonitorTest {

    private static Object invoke(TauriProcessMonitor monitor, String name) throws Exception {
        Method method = TauriProcessMonitor.class.getDeclaredMethod(name);
        method.setAccessible(true);
        return method.invoke(monitor);
    }

    private static void setField(TauriProcessMonitor monitor, String name, Object value)
            throws Exception {
        Field field = TauriProcessMonitor.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(monitor, value);
    }

    private static Object getField(TauriProcessMonitor monitor, String name) throws Exception {
        Field field = TauriProcessMonitor.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(monitor);
    }

    private static AtomicBoolean monitoringFlag(TauriProcessMonitor monitor) throws Exception {
        return (AtomicBoolean) getField(monitor, "monitoring");
    }

    private static CountDownLatch closingContext(ConfigurableApplicationContext ctx) {
        CountDownLatch closed = new CountDownLatch(1);
        doAnswer(
                        invocation -> {
                            closed.countDown();
                            return null;
                        })
                .when(ctx)
                .close();
        return closed;
    }

    @Test
    @DisplayName("init without Tauri env disables monitoring")
    void initWithoutEnvDisablesMonitoring() throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        monitor.init();

        assertThat(monitoringFlag(monitor)).isFalse();
        assertThat(getField(monitor, "scheduler")).isNull();
    }

    @Test
    @DisplayName("init with a parent that already exited shuts the backend down")
    void initWithGoneParentShutsDown(@TempDir Path tmp) throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        CountDownLatch closed = closingContext(ctx);
        TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
        Path sentinel = Files.writeString(tmp.resolve("backend.stop"), "stop");

        monitor.init(String.valueOf(Long.MAX_VALUE), sentinel.toString());

        assertThat(closed.await(2, TimeUnit.SECONDS)).isTrue();
        // The stop request stays on disk for Tauri's next-launch sweep.
        assertThat(Files.exists(sentinel)).isTrue();
        assertThat(getField(monitor, "scheduler")).isNull();
    }

    @Test
    @DisplayName("init with an unparsable parent PID still watches the sentinel")
    void initWithInvalidParentPidKeepsWatching(@TempDir Path tmp) throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        monitor.init("not-a-pid", tmp.resolve("absent.stop").toString());
        try {
            assertThat(monitoringFlag(monitor)).isTrue();
            assertThat(getField(monitor, "scheduler")).isNotNull();
        } finally {
            monitor.cleanup();
        }
    }

    @Test
    @DisplayName("init with a live parent keeps monitoring")
    void initWithLiveParentKeepsMonitoring(@TempDir Path tmp) throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

        monitor.init(
                String.valueOf(ProcessHandle.current().pid()),
                tmp.resolve("absent.stop").toString());
        try {
            assertThat(monitoringFlag(monitor)).isTrue();
            assertThat(getField(monitor, "parentHandle")).isNotNull();
        } finally {
            monitor.cleanup();
        }
    }

    @Test
    @DisplayName("sentinel file triggers a graceful context close")
    void sentinelTriggersShutdown(@TempDir Path tmp) throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        CountDownLatch closed = closingContext(ctx);
        TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
        Path sentinel = Files.writeString(tmp.resolve("backend.stop"), "stop");
        setField(monitor, "shutdownFile", sentinel);
        setField(monitor, "monitoring", new AtomicBoolean(true));

        invoke(monitor, "checkShutdownFile");

        assertThat(closed.await(2, TimeUnit.SECONDS)).isTrue();
        assertThat(Files.exists(sentinel)).isFalse();
    }

    @Test
    @DisplayName("missing sentinel leaves the backend running")
    void absentSentinelKeepsRunning(@TempDir Path tmp) throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        setField(monitor, "shutdownFile", tmp.resolve("absent.stop"));
        setField(monitor, "monitoring", new AtomicBoolean(true));

        invoke(monitor, "checkShutdownFile");

        assertThat(monitoringFlag(monitor)).isTrue();
    }

    @Test
    @DisplayName("dead parent process triggers a graceful close")
    void deadParentTriggersShutdown() throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        CountDownLatch closed = closingContext(ctx);
        TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
        ProcessHandle parent = mock(ProcessHandle.class);
        when(parent.isAlive()).thenReturn(false);
        setField(monitor, "parentHandle", parent);
        setField(monitor, "monitoring", new AtomicBoolean(true));

        invoke(monitor, "checkParentProcess");

        assertThat(closed.await(2, TimeUnit.SECONDS)).isTrue();
    }

    @Test
    @DisplayName("live parent process leaves the backend running")
    void liveParentKeepsRunning() throws Exception {
        ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
        TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
        ProcessHandle parent = mock(ProcessHandle.class);
        when(parent.isAlive()).thenReturn(true);
        setField(monitor, "parentHandle", parent);
        setField(monitor, "monitoring", new AtomicBoolean(true));

        invoke(monitor, "checkParentProcess");

        assertThat(monitoringFlag(monitor)).isTrue();
        verify(ctx, never()).close();
    }

    @Test
    @DisplayName("cleanup shuts down an active scheduler")
    void cleanupShutsScheduler() throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
        when(scheduler.isShutdown()).thenReturn(false);
        when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS))).thenReturn(true);
        setField(monitor, "scheduler", scheduler);
        setField(monitor, "monitoring", new AtomicBoolean(true));

        monitor.cleanup();

        verify(scheduler, times(1)).shutdown();
        assertThat(monitoringFlag(monitor)).isFalse();
    }

    @Test
    @DisplayName("cleanup forces shutdownNow when awaitTermination times out")
    void cleanupForcesShutdownNow() throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
        when(scheduler.isShutdown()).thenReturn(false);
        when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS))).thenReturn(false);
        setField(monitor, "scheduler", scheduler);

        monitor.cleanup();

        verify(scheduler, times(1)).shutdownNow();
    }

    @Test
    @DisplayName("cleanup restores the interrupt flag")
    void cleanupRestoresInterrupt() throws Exception {
        TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
        ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
        when(scheduler.isShutdown()).thenReturn(false);
        when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS)))
                .thenThrow(new InterruptedException("boom"));
        setField(monitor, "scheduler", scheduler);

        monitor.cleanup();

        verify(scheduler, times(1)).shutdownNow();
        assertThat(Thread.interrupted()).isTrue();
    }
}
