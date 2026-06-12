package stirling.software.SPDF.config;

import java.time.LocalDateTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import io.quarkus.runtime.StartupEvent;

@ApplicationScoped
public class StartupApplicationListener {

    public static LocalDateTime startTime;

    void onStart(@Observes StartupEvent event) {
        startTime = LocalDateTime.now();
    }
}
