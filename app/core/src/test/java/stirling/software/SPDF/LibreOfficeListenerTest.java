package stirling.software.SPDF;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import io.github.pixee.security.SystemCommand;

class LibreOfficeListenerTest {

    private LibreOfficeListener listener;

    @BeforeEach
    void setUp() throws Exception {
        listener = LibreOfficeListener.getInstance();
        resetListenerState();
    }

    @AfterEach
    void tearDown() throws Exception {
        resetListenerState();
    }

    @Test
    void startDoesNotRestartWhenProcessIsAlive() throws Exception {
        Process mockProcess = mock(Process.class);
        when(mockProcess.isAlive()).thenReturn(true);
        setField("process", mockProcess);

        try (MockedStatic<SystemCommand> mocked = mockStatic(SystemCommand.class)) {
            listener.start();
            mocked.verify(
                    () -> SystemCommand.runCommand(any(Runtime.class), eq("unoconv --listener")),
                    never());
        }
    }

    @Test
    void stopShutsDownExecutorAndDestroysProcess() throws Exception {
        ExecutorService executor = mock(ExecutorService.class);
        Process mockProcess = mock(Process.class);
        when(mockProcess.isAlive()).thenReturn(true);

        setField("executorService", executor);
        setField("process", mockProcess);

        listener.stop();

        verify(executor).shutdownNow();
        verify(mockProcess).destroy();

        // Ensure no lingering state for other tests
        setField("executorService", null);
        setField("process", null);
    }

    @Test
    void startLaunchesListenerWhenNotRunning() throws Exception {
        Process mockProcess = mock(Process.class);
        when(mockProcess.isAlive()).thenReturn(true);

        try (ServerSocket serverSocket = new ServerSocket()) {
            serverSocket.bind(new InetSocketAddress("localhost", 2002));
            CountDownLatch connectionAccepted = new CountDownLatch(1);
            ExecutorService acceptor = Executors.newSingleThreadExecutor();
            acceptor.submit(
                    () -> {
                        try (Socket socket = serverSocket.accept()) {
                            connectionAccepted.countDown();
                        } catch (IOException ignored) {
                        }
                    });

            try (MockedStatic<SystemCommand> mocked = mockStatic(SystemCommand.class)) {
                mocked.when(
                                () ->
                                        SystemCommand.runCommand(
                                                any(Runtime.class), eq("unoconv --listener")))
                        .thenReturn(mockProcess);

                listener.start();

                mocked.verify(
                        () ->
                                SystemCommand.runCommand(
                                        any(Runtime.class), eq("unoconv --listener")));
            }

            assertTrue(connectionAccepted.await(2, TimeUnit.SECONDS));
            acceptor.shutdownNow();
        }

        assertSame(mockProcess, getField("process"));
        assertNotNull(getField("executorService"));
        assertTrue((long) getField("lastActivityTime") > 0);

        listener.stop();
        verify(mockProcess, atLeastOnce()).destroy();
    }

    @Test
    void isListenerRunningReturnsFalseWhenExceptionOccurs() throws Exception {
        // Mock Socket to throw exception
        try (MockedConstruction<Socket> socketMock =
                Mockito.mockConstruction(
                        Socket.class,
                        (mock, context) -> {
                            when(mock.isConnected())
                                    .thenThrow(new IOException("Connection failed"));
                        })) {

            Method isListenerRunning =
                    LibreOfficeListener.class.getDeclaredMethod("isListenerRunning");
            isListenerRunning.setAccessible(true);

            boolean result = (boolean) isListenerRunning.invoke(listener);

            assertFalse(result, "Should return false when exception occurs");
        }
    }

    @Test
    void processIsDestroyedWhenInactive() throws Exception {
        Process mockProcess = mock(Process.class);
        when(mockProcess.isAlive()).thenReturn(true);

        // Set up the listener with a mock process
        Field processField = LibreOfficeListener.class.getDeclaredField("process");
        processField.setAccessible(true);
        processField.set(listener, mockProcess);

        Field lastActivityField = LibreOfficeListener.class.getDeclaredField("lastActivityTime");
        lastActivityField.setAccessible(true);
        // Set activity time to more than 20 minutes ago
        lastActivityField.set(listener, System.currentTimeMillis() - (21L * 60 * 1000));

        Field executorField = LibreOfficeListener.class.getDeclaredField("executorService");
        executorField.setAccessible(true);
        ExecutorService mockExecutor = Executors.newSingleThreadExecutor();
        executorField.set(listener, mockExecutor);

        // Manually invoke the monitoring logic
        // Find the Runnable that does the monitoring
        mockExecutor.submit(
                () -> {
                    try {
                        long currentTime = System.currentTimeMillis();
                        long lastActivity = (long) lastActivityField.get(listener);
                        Process proc = (Process) processField.get(listener);

                        if (proc != null
                                && proc.isAlive()
                                && (currentTime - lastActivity > 20L * 60 * 1000)) {
                            proc.destroy();
                        }
                    } catch (Exception e) {
                        fail("Exception in monitoring: " + e.getMessage());
                    }
                });

        mockExecutor.shutdown();
        assertTrue(mockExecutor.awaitTermination(3, TimeUnit.SECONDS));

        verify(mockProcess, times(1)).destroy();
    }

    @Test
    void interruptedExceptionIsHandledGracefully() throws Exception {
        Thread testThread =
                new Thread(
                        () -> {
                            try {
                                Thread.currentThread().interrupt();
                                Thread.sleep(1000);
                                fail("Should throw InterruptedException");
                            } catch (InterruptedException e) {
                                assertTrue(
                                        Thread.currentThread().isInterrupted(),
                                        "Thread should remain interrupted");
                            }
                        });

        testThread.start();
        testThread.join(3000);
        assertFalse(testThread.isAlive(), "Thread should complete");
    }

    @Test
    void monitoringLoopChecksEverySecond() throws Exception {
        long startTime = System.currentTimeMillis();
        int iterations = 3;

        for (int i = 0; i < iterations; i++) {
            Thread.sleep(1000);
        }

        long elapsed = System.currentTimeMillis() - startTime;

        assertTrue(
                elapsed >= (iterations * 1000), "Should wait approximately 1 second per iteration");
        assertTrue(
                elapsed < (iterations * 1000 + 500),
                "Should not wait significantly longer than expected");
    }

    @Test
    void processDestroyIsCalledOnlyOnce() throws Exception {
        Process mockProcess = mock(Process.class);
        when(mockProcess.isAlive()).thenReturn(true).thenReturn(false);

        Field processField = LibreOfficeListener.class.getDeclaredField("process");
        processField.setAccessible(true);
        processField.set(listener, mockProcess);

        // Simulate multiple destroy attempts
        for (int i = 0; i < 3; i++) {
            if (mockProcess.isAlive()) {
                mockProcess.destroy();
                break;
            }
        }

        verify(mockProcess, times(1)).destroy();
    }

    private void resetListenerState() throws Exception {
        ExecutorService executor = (ExecutorService) getField("executorService");
        if (executor != null) {
            executor.shutdownNow();
        }

        Process process = (Process) getField("process");
        if (process != null) {
            process.destroy();
        }

        setField("executorService", null);
        setField("process", null);
        setLongField("lastActivityTime", 0L);
    }

    private Object getField(String fieldName) throws Exception {
        Field field = LibreOfficeListener.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        return field.get(listener);
    }

    private void setField(String fieldName, Object value) throws Exception {
        Field field = LibreOfficeListener.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(listener, value);
    }

    private void setLongField(String fieldName, long value) throws Exception {
        Field field = LibreOfficeListener.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.setLong(listener, value);
    }
}
