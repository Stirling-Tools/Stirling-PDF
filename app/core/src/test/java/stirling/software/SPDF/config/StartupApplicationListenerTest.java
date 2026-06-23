package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.event.ContextRefreshedEvent;

class StartupApplicationListenerTest {

    @Test
    @DisplayName("onApplicationEvent records a startup time")
    void recordsStartTime() {
        StartupApplicationListener listener = new StartupApplicationListener();
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);

        listener.onApplicationEvent(new ContextRefreshedEvent(new EmptyContext()));

        assertThat(StartupApplicationListener.startTime).isNotNull();
        assertThat(StartupApplicationListener.startTime).isAfterOrEqualTo(before);
    }

    // Minimal ApplicationContext to satisfy ContextRefreshedEvent construction.
    private static class EmptyContext
            extends org.springframework.context.support.StaticApplicationContext {}
}
