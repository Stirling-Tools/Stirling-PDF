package stirling.software.SPDF.controller.api;

import java.util.Arrays;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * API endpoint for on-demand error message translation.
 * Provides translations for error messages when needed instead of pre-loading all translations.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class TranslationController {

    private final MessageSource messageSource;

    /**
     * Get translated error message for user's locale.
     * 
     * @param key the translation key (e.g. "error.dpiExceedsLimit")
     * @param args comma-separated arguments for message formatting
     * @return translated message in user's locale
     */
    @GetMapping("/translate")
    public ResponseEntity<String> translate(
            @RequestParam String key,
            @RequestParam(required = false) String args) {
        
        try {
            Object[] messageArgs = null;
            if (args != null && !args.trim().isEmpty()) {
                messageArgs = Arrays.stream(args.split(","))
                    .map(String::trim)
                    .toArray();
            }

            String translatedMessage = messageSource.getMessage(
                key, 
                messageArgs, 
                LocaleContextHolder.getLocale()
            );

            return ResponseEntity.ok(translatedMessage);

        } catch (Exception e) {
            log.debug("Translation failed for key '{}': {}", key, e.getMessage());
            return ResponseEntity.notFound().build();
        }
    }
}