package stirling.software.common.util;

/**
 * Exception that carries translation information for frontend internationalization. The
 * GlobalExceptionHandler extracts this info to create structured error responses.
 */
public class TranslatableException extends IllegalArgumentException {

    private final String translationKey;
    private final Object[] translationArgs;

    public TranslatableException(String message, String translationKey, Object... translationArgs) {
        super(message);
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
