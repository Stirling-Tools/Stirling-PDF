package stirling.software.SPDF.config;

import java.time.LocalDateTime;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

@ApplicationScoped
public class StartupApplicationListener {

    public static LocalDateTime startTime;

    void onStart(@Observes StartupEvent event) {
        startTime = LocalDateTime.now();
    }
}
