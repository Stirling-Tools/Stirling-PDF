package stirling.software.common.util;

import java.io.IOException;

/**
 * IOException that carries translation information for frontend internationalization. The
 * GlobalExceptionHandler extracts this info to create structured error responses.
 */
public class TranslatableIOException extends IOException {

    private final String translationKey;
    private final Object[] translationArgs;

    public TranslatableIOException(
            String message, String translationKey, Exception cause, Object... translationArgs) {
        super(message, cause);
        this.translationKey = translationKey;
        this.translationArgs = translationArgs;
    }

    public String getTranslationKey() {
        return translationKey;
    }

    public Object[] getTranslationArgs() {
        return translationArgs;
    }
}
