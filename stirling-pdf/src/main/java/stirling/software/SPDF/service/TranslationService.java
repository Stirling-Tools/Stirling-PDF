package stirling.software.SPDF.service;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service for providing translation data to frontend JavaScript. Dynamically loads all error.*
 * messages for client-side translation.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TranslationService {

    private final MessageSource messageSource;

    /**
     * Get all error messages for the current locale to pass to frontend JavaScript. This allows
     * dynamic translation of error messages sent from backend.
     *
     * @return Map of error message keys to localized values
     */
    public Map<String, String> getErrorMessages() {
        return getErrorMessages(LocaleContextHolder.getLocale());
    }

    /**
     * Get all error messages for a specific locale.
     *
     * @param locale the locale to get messages for
     * @return Map of error message keys to localized values
     */
    public Map<String, String> getErrorMessages(Locale locale) {
        Map<String, String> errorMessages = new HashMap<>();

        try {
            // Load the base messages file to get all available keys
            ClassPathResource resource = new ClassPathResource("messages_en_GB.properties");
            Properties properties = PropertiesLoaderUtils.loadProperties(resource);

            // Filter for error.* keys and get their localized values
            for (Object keyObj : properties.keySet()) {
                String key = (String) keyObj;
                if (key.startsWith("error.")) {
                    try {
                        String localizedMessage = messageSource.getMessage(key, null, locale);
                        errorMessages.put(key, localizedMessage);
                    } catch (Exception e) {
                        log.debug(
                                "Could not resolve message for key '{}' in locale '{}': {}",
                                key,
                                locale,
                                e.getMessage());
                        // Fallback to the default message from properties
                        errorMessages.put(key, (String) properties.get(key));
                    }
                }
            }

            log.debug("Loaded {} error messages for locale '{}'", errorMessages.size(), locale);

        } catch (Exception e) {
            log.error("Failed to load error messages for locale '{}': {}", locale, e.getMessage());
        }

        return errorMessages;
    }
}
