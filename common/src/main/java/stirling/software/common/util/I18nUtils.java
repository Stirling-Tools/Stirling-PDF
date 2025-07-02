package stirling.software.common.util;

import java.util.Locale;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility class for internationalized (i18n) message handling. Provides centralized access to
 * Spring MessageSource for consistent error messaging.
 */
@Slf4j
public class I18nUtils {

    private static MessageSource messageSource;

    /**
     * Get the MessageSource bean from the application context.
     *
     * @return MessageSource instance, or null if not available
     */
    public static MessageSource getMessageSource() {
        if (messageSource == null) {
            try {
                messageSource = ApplicationContextProvider.getBean(MessageSource.class);
            } catch (Exception e) {
                log.debug("MessageSource not available in application context", e);
                return null;
            }
        }
        return messageSource;
    }

    /**
     * Get a localized message for the given key with parameters.
     *
     * @param key the message key
     * @param args optional arguments for the message
     * @return the localized message, or the key itself if message source is not available
     */
    public static String getMessage(String key, Object... args) {
        return getMessage(key, LocaleContextHolder.getLocale(), args);
    }

    /**
     * Get a localized message for the given key with specific locale and parameters.
     *
     * @param key the message key
     * @param locale the locale to use
     * @param args optional arguments for the message
     * @return the localized message, or the key itself if message source is not available
     */
    public static String getMessage(String key, Locale locale, Object... args) {
        MessageSource ms = getMessageSource();
        if (ms != null) {
            try {
                return ms.getMessage(key, args, locale);
            } catch (Exception e) {
                log.debug("Failed to get message for key '{}': {}", key, e.getMessage());
            }
        }

        // Fallback: return the key with arguments if available
        if (args != null && args.length > 0) {
            return key
                    + " ["
                    + String.join(
                            ", ",
                            java.util.Arrays.stream(args)
                                    .map(Object::toString)
                                    .toArray(String[]::new))
                    + "]";
        }
        return key;
    }

    /**
     * Get a localized message with a fallback default message.
     *
     * @param key the message key
     * @param defaultMessage the default message to use if key is not found
     * @param args optional arguments for the message
     * @return the localized message or the default message
     */
    public static String getMessage(String key, String defaultMessage, Object... args) {
        MessageSource ms = getMessageSource();
        if (ms != null) {
            try {
                return ms.getMessage(key, args, defaultMessage, LocaleContextHolder.getLocale());
            } catch (Exception e) {
                log.debug("Failed to get message for key '{}': {}", key, e.getMessage());
            }
        }

        // Apply arguments to default message if it contains placeholders
        if (defaultMessage != null && args != null && args.length > 0) {
            try {
                return java.text.MessageFormat.format(defaultMessage, args);
            } catch (Exception e) {
                log.debug("Failed to format default message: {}", e.getMessage());
            }
        }

        return defaultMessage != null ? defaultMessage : key;
    }

    /**
     * Check if MessageSource is available.
     *
     * @return true if MessageSource is available, false otherwise
     */
    public static boolean isMessageSourceAvailable() {
        return getMessageSource() != null;
    }
}
