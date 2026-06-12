package stirling.software.common.configuration;

import jakarta.enterprise.context.ApplicationScoped;

import com.posthog.java.PostHogLogger;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@ApplicationScoped
public class PostHogLoggerImpl implements PostHogLogger {

    @Override
    public void debug(String message) {
        log.debug(message);
    }

    @Override
    public void info(String message) {
        log.info(message);
    }

    @Override
    public void warn(String message) {
        log.warn(message);
    }

    @Override
    public void error(String message) {
        log.error(message);
    }

    @Override
    public void error(String message, Throwable throwable) {
        if (message.contains("Error sending events to PostHog")) {
            log.warn(
                    "Error sending metrics, Likely caused by no internet connection. Non Blocking");
        } else {
            log.error(message, throwable);
        }
    }
}
