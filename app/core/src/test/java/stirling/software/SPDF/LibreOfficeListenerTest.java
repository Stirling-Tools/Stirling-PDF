package stirling.software.SPDF;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

import java.lang.reflect.Field;
import java.net.Socket;
import java.util.concurrent.ExecutorService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import io.github.pixee.security.SystemCommand;

/**
 * Unit tests for {@link LibreOfficeListener}. The process, socket and SystemCommand boundaries are
 * mocked so no real soffice/unoconv process or network connection is ever created.
 */
@DisplayName("LibreOfficeListener")
class LibreOfficeListenerTest {

    private LibreOfficeListener listener;

    @BeforeEach
    void setUp() {
        listener = LibreOfficeListener.getInstance();
    }

    @AfterEach
    void tearDown() throws Exception {
        // Reset the singleton's mutable state so tests stay independent.
        ExecutorService es = readExecutor();
        if (es != null) {
            es.shutdownNow();
        }
        setField("process", null);
        setField("executorService", null);
    }

    private void setField(String name, Object value) throws Exception {
        Field f = LibreOfficeListener.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(listener, value);
    }

    private Object readField(String name) throws Exception {
        Field f = LibreOfficeListener.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(listener);
    }

    private ExecutorService readExecutor() throws Exception {
        return (ExecutorService) readField("executorService");
    }

    @Nested
    @DisplayName("getInstance")
    class GetInstance {

        @Test
        @DisplayName("always returns the same singleton instance")
        void singletonIsStable() {
            assertThat(LibreOfficeListener.getInstance())
                    .isSameAs(LibreOfficeListener.getInstance());
        }
    }

    @Nested
    @DisplayName("start")
    class Start {

        @Test
        @DisplayName("returns immediately when a live process already exists")
        void alreadyRunningShortCircuits() throws Exception {
            Process alive = Mockito.mock(Process.class);
            Mockito.when(alive.isAlive()).thenReturn(true);
            setField("process", alive);

            try (MockedStatic<SystemCommand> sys = Mockito.mockStatic(SystemCommand.class)) {
                listener.start();

                // No new process is spawned when one is already alive.
                sys.verifyNoInteractions();
                assertThat(readField("process")).isSameAs(alive);
                assertThat(readExecutor()).isNull();
            }
        }

        @Test
        @DisplayName("spawns the listener and returns once the socket connects")
        void spawnsAndDetectsRunningListener() throws Exception {
            Process spawned = Mockito.mock(Process.class);

            try (MockedStatic<SystemCommand> sys = Mockito.mockStatic(SystemCommand.class);
                    MockedConstruction<Socket> socket = Mockito.mockConstruction(Socket.class)) {

                sys.when(() -> SystemCommand.runCommand(any(Runtime.class), anyString()))
                        .thenReturn(spawned);

                listener.start();

                // The spawned process is retained and the monitor executor is created.
                assertThat(readField("process")).isSameAs(spawned);
                assertThat(readExecutor()).isNotNull();
                // A socket was constructed and connected exactly once on the first poll.
                assertThat(socket.constructed()).hasSize(1);
                Mockito.verify(socket.constructed().get(0)).connect(any(), eq(1000));
                sys.verify(
                        () ->
                                SystemCommand.runCommand(
                                        any(Runtime.class), eq("unoconv --listener")));
            }
        }

        @Test
        @DisplayName("retries until the listener socket becomes reachable")
        void retriesUntilSocketReachable() throws Exception {
            Process spawned = Mockito.mock(Process.class);

            // First socket fails to connect, second succeeds; start() should poll twice.
            try (MockedStatic<SystemCommand> sys = Mockito.mockStatic(SystemCommand.class);
                    MockedConstruction<Socket> socket =
                            Mockito.mockConstruction(
                                    Socket.class,
                                    (mock, ctx) -> {
                                        if (ctx.getCount() == 1) {
                                            Mockito.doThrow(new java.io.IOException("refused"))
                                                    .when(mock)
                                                    .connect(any(), eq(1000));
                                        }
                                    })) {

                sys.when(() -> SystemCommand.runCommand(any(Runtime.class), anyString()))
                        .thenReturn(spawned);

                listener.start();

                // At least two sockets were attempted before one connected.
                assertThat(socket.constructed().size()).isGreaterThanOrEqualTo(2);
            }
        }
    }

    @Nested
    @DisplayName("stop")
    class Stop {

        @Test
        @DisplayName("shuts down the monitor and destroys a live process")
        void destroysLiveProcess() throws Exception {
            Process alive = Mockito.mock(Process.class);
            Mockito.when(alive.isAlive()).thenReturn(true);
            ExecutorService es = Mockito.mock(ExecutorService.class);
            setField("process", alive);
            setField("executorService", es);

            listener.stop();

            Mockito.verify(es).shutdownNow();
            Mockito.verify(alive).destroy();
        }

        @Test
        @DisplayName("does not destroy a process that is already dead")
        void skipsDestroyWhenProcessDead() throws Exception {
            Process dead = Mockito.mock(Process.class);
            Mockito.when(dead.isAlive()).thenReturn(false);
            ExecutorService es = Mockito.mock(ExecutorService.class);
            setField("process", dead);
            setField("executorService", es);

            listener.stop();

            Mockito.verify(es).shutdownNow();
            Mockito.verify(dead, Mockito.never()).destroy();
        }
    }
}
