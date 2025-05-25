package stirling.software.SPDF.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.utils.ConversionTask;

/**
 * Fallback configuration for when UnoServerManager is not available. This will provide friendly
 * error messages when users try to use LibreOffice conversion features without having UnoServer
 * installed.
 */
@Configuration
@Slf4j
public class UnoServerManagerFallback {

    /**
     * Creates a bean that provides a friendly error message when LibreOffice conversion is
     * attempted but UnoServer is not available.
     */
    @Bean
    @ConditionalOnMissingBean(UnoServerManager.class)
    public UnoServerNotAvailableHandler unoServerNotAvailableHandler(
            RuntimePathConfig runtimePathConfig) {
        log.info("UnoServer is not available. Office document conversions will be disabled.");
        log.info("If you need Office document conversions, please install UnoServer.");
        log.info("For Docker users, use the 'fat' image variant which includes UnoServer.");

        // Log the path where we would expect to find unoconvert
        if (runtimePathConfig != null) {
            log.info("Expected unoconvert path: {}", runtimePathConfig.getUnoConvertPath());
        }

        return new UnoServerNotAvailableHandler();
    }

    /**
     * Handler that provides friendly error messages when LibreOffice conversion is attempted but
     * UnoServer is not available.
     */
    public static class UnoServerNotAvailableHandler {
        /** Method that throws a friendly exception when office conversions are attempted. */
        public void throwUnoServerNotAvailableException() {
            throw new UnoServerNotAvailableException(
                    "UnoServer (LibreOffice) is not available. Office document conversions are disabled. "
                            + "To enable this feature, please install UnoServer or use the 'fat' Docker image variant.");
        }

        /** Creates a failed conversion task with a friendly error message. */
        public ConversionTask createFailedTask(String taskName) {
            ConversionTask task = new ConversionTask(taskName, (String) null);
            task.fail(
                    "UnoServer (LibreOffice) is not available. Office document conversions are disabled.");
            return task;
        }
    }

    /** Exception thrown when UnoServer features are used but UnoServer is not available. */
    public static class UnoServerNotAvailableException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public UnoServerNotAvailableException(String message) {
            super(message);
        }
    }
}
