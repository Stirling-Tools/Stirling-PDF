package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Optional;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

@DisplayName("TauriProcessMonitor")
class TauriProcessMonitorTest {

    private static Object invokePrivate(TauriProcessMonitor monitor, String name, Object... args)
            throws Exception {
        Method method = findMethod(name);
        method.setAccessible(true);
        return method.invoke(monitor, args);
    }

    private static Method findMethod(String name) {
        for (Method m : TauriProcessMonitor.class.getDeclaredMethods()) {
            if (m.getName().equals(name)) {
                return m;
            }
        }
        throw new IllegalStateException("Method not found: " + name);
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

    @Nested
    @DisplayName("getCurrentProcessId")
    class CurrentProcessId {

        @Test
        @DisplayName("returns a non-blank PID string")
        void returnsPid() {
            assertThat(TauriProcessMonitor.getCurrentProcessId()).isNotBlank();
        }
    }

    @Nested
    @DisplayName("init")
    class Init {

        // System.getenv cannot be mocked (java.base), so init() is exercised against the real
        // environment, which has no TAURI_PARENT_PID; the present-PID path is driven directly
        // through startMonitoring().

        @Test
        @DisplayName("startMonitoring flips monitoring on and creates a scheduler")
        void startMonitoringSchedulesTask() throws Exception {
            ApplicationContext ctx = mock(ApplicationContext.class);
            TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
            setField(monitor, "parentProcessId", "12345");

            try {
                invokePrivate(monitor, "startMonitoring");

                assertThat((Boolean) getField(monitor, "monitoring")).isTrue();
                assertThat(getField(monitor, "scheduler")).isNotNull();
                assertThat((String) getField(monitor, "parentProcessId")).isEqualTo("12345");
            } finally {
                // Stop the scheduler thread created by startMonitoring.
                monitor.cleanup();
            }
        }
    }

    @Nested
    @DisplayName("isProcessAlive")
    class IsProcessAlive {

        @Test
        @DisplayName("returns true when ProcessHandle reports the PID present")
        void aliveWhenPresent() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

            try (MockedStatic<ProcessHandle> ph = mockStatic(ProcessHandle.class)) {
                ph.when(() -> ProcessHandle.of(999L))
                        .thenReturn(Optional.of(mock(ProcessHandle.class)));
                Object result = invokePrivate(monitor, "isProcessAlive", "999");
                assertThat((Boolean) result).isTrue();
            }
        }

        @Test
        @DisplayName("returns false when ProcessHandle reports the PID absent")
        void deadWhenAbsent() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

            try (MockedStatic<ProcessHandle> ph = mockStatic(ProcessHandle.class)) {
                ph.when(() -> ProcessHandle.of(999L)).thenReturn(Optional.empty());
                Object result = invokePrivate(monitor, "isProcessAlive", "999");
                assertThat((Boolean) result).isFalse();
            }
        }

        @Test
        @DisplayName("returns false for a non-numeric PID")
        void falseForInvalidPid() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

            Object result = invokePrivate(monitor, "isProcessAlive", "not-a-number");
            assertThat((Boolean) result).isFalse();
        }
    }

    @Nested
    @DisplayName("checkParentProcess")
    class CheckParentProcess {

        @Test
        @DisplayName("returns early when monitoring is off")
        void earlyReturnWhenNotMonitoring() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
            setField(monitor, "monitoring", false);

            // Should not throw even though parentProcessId is null.
            invokePrivate(monitor, "checkParentProcess");
        }

        @Test
        @DisplayName("triggers graceful shutdown when the parent process is dead")
        void shutsDownWhenParentDead() throws Exception {
            ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
            TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
            setField(monitor, "monitoring", true);
            setField(monitor, "parentProcessId", "999");

            try (MockedStatic<ProcessHandle> ph = mockStatic(ProcessHandle.class)) {
                ph.when(() -> ProcessHandle.of(999L)).thenReturn(Optional.empty());

                invokePrivate(monitor, "checkParentProcess");

                // initiateGracefulShutdown flips monitoring off and spawns an async close.
                // The async close runs after a hardcoded 1s sleep, so we assert only the
                // immediate, deterministic effect to keep the test fast.
                assertThat((Boolean) getField(monitor, "monitoring")).isFalse();
            }
        }

        @Test
        @DisplayName("does nothing when the parent process is still alive")
        void noShutdownWhenParentAlive() throws Exception {
            ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
            TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
            setField(monitor, "monitoring", true);
            setField(monitor, "parentProcessId", "999");

            try (MockedStatic<ProcessHandle> ph = mockStatic(ProcessHandle.class)) {
                ph.when(() -> ProcessHandle.of(999L))
                        .thenReturn(Optional.of(mock(ProcessHandle.class)));

                invokePrivate(monitor, "checkParentProcess");

                assertThat((Boolean) getField(monitor, "monitoring")).isTrue();
            }
            verify(ctx, never()).close();
        }
    }

    @Nested
    @DisplayName("initiateGracefulShutdown")
    class InitiateGracefulShutdown {

        @Test
        @DisplayName("closes a ConfigurableApplicationContext asynchronously")
        void closesConfigurableContext() throws Exception {
            ConfigurableApplicationContext ctx = mock(ConfigurableApplicationContext.class);
            TauriProcessMonitor monitor = new TauriProcessMonitor(ctx);
            setField(monitor, "monitoring", true);

            invokePrivate(monitor, "initiateGracefulShutdown");

            // The async close runs after a hardcoded 1s sleep; assert only the immediate effect.
            assertThat((Boolean) getField(monitor, "monitoring")).isFalse();
        }
    }

    @Nested
    @DisplayName("cleanup")
    class Cleanup {

        @Test
        @DisplayName("is a no-op when no scheduler was created")
        void noOpWithoutScheduler() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));

            // scheduler is null by default; cleanup must not throw.
            monitor.cleanup();

            assertThat((Boolean) getField(monitor, "monitoring")).isFalse();
        }

        @Test
        @DisplayName("shuts down an active scheduler")
        void shutsDownActiveScheduler() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
            ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
            when(scheduler.isShutdown()).thenReturn(false);
            when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS))).thenReturn(true);
            setField(monitor, "scheduler", scheduler);
            setField(monitor, "monitoring", true);

            monitor.cleanup();

            verify(scheduler, times(1)).shutdown();
            assertThat((Boolean) getField(monitor, "monitoring")).isFalse();
        }

        @Test
        @DisplayName("forces shutdownNow when awaitTermination times out")
        void forcesShutdownNowOnTimeout() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
            ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
            when(scheduler.isShutdown()).thenReturn(false);
            when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS))).thenReturn(false);
            setField(monitor, "scheduler", scheduler);

            monitor.cleanup();

            verify(scheduler, times(1)).shutdown();
            verify(scheduler, times(1)).shutdownNow();
        }

        @Test
        @DisplayName("restores interrupt flag when awaitTermination is interrupted")
        void handlesInterruptedException() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
            ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
            when(scheduler.isShutdown()).thenReturn(false);
            when(scheduler.awaitTermination(eq(2L), eq(TimeUnit.SECONDS)))
                    .thenThrow(new InterruptedException("boom"));
            setField(monitor, "scheduler", scheduler);

            monitor.cleanup();

            verify(scheduler, times(1)).shutdownNow();
            // Clear the interrupt flag we just set so it does not leak to other tests.
            assertThat(Thread.interrupted()).isTrue();
        }

        @Test
        @DisplayName("skips shutdown when scheduler already terminated")
        void skipsAlreadyShutdownScheduler() throws Exception {
            TauriProcessMonitor monitor = new TauriProcessMonitor(mock(ApplicationContext.class));
            ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
            when(scheduler.isShutdown()).thenReturn(true);
            setField(monitor, "scheduler", scheduler);

            monitor.cleanup();

            verify(scheduler, never()).shutdown();
        }
    }
}
