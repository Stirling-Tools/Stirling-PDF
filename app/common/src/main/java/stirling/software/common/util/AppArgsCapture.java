package stirling.software.common.util;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import io.quarkus.runtime.StartupEvent;
import io.quarkus.runtime.annotations.CommandLineArguments;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

/**
 * Captures application command-line arguments at startup so they can be reused for restart
 * operations. This allows the application to restart with the same configuration.
 *
 * <p>MIGRATION (Spring -> Quarkus): replaced Spring's {@code ApplicationRunner}/{@code
 * ApplicationArguments} with a CDI startup observer ({@code @Observes StartupEvent}) and Quarkus'
 * {@code @CommandLineArguments String[]} injection.
 */
@Slf4j
@ApplicationScoped
public class AppArgsCapture {

    public static final AtomicReference<List<String>> APP_ARGS = new AtomicReference<>(List.of());

    @Inject @CommandLineArguments String[] args;

    void onStart(@Observes StartupEvent event) {
        APP_ARGS.set(List.of(args));
        log.debug("Captured {} application arguments for restart capability", args.length);
    }
}
