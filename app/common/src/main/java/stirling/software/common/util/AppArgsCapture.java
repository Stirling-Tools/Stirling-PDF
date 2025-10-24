package stirling.software.common.util;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Captures application command-line arguments at startup so they can be reused for restart
 * operations. This allows the application to restart with the same configuration.
 */
@Slf4j
@Component
public class AppArgsCapture implements ApplicationRunner {

    public static final AtomicReference<List<String>> APP_ARGS = new AtomicReference<>(List.of());

    @Override
    public void run(ApplicationArguments args) {
        APP_ARGS.set(List.of(args.getSourceArgs()));
        log.debug(
                "Captured {} application arguments for restart capability",
                args.getSourceArgs().length);
    }
}
