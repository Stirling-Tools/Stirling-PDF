package stirling.software.proprietary.service;

import org.springframework.stereotype.Component;

import stirling.software.proprietary.model.CreditRequestContext;

/**
 * Thread-local storage for credit request context Allows tracking credit information throughout the
 * request lifecycle
 */
@Component
public class CreditContextManager {

    private static final ThreadLocal<CreditRequestContext> contextHolder = new ThreadLocal<>();

    /** Store credit context for the current request thread */
    public void setContext(CreditRequestContext context) {
        contextHolder.set(context);
    }

    /** Get credit context for the current request thread */
    public CreditRequestContext getContext() {
        return contextHolder.get();
    }

    /** Clear the credit context (should be called at end of request) */
    public void clearContext() {
        contextHolder.remove();
    }

    /** Check if there's an active credit context */
    public boolean hasContext() {
        return contextHolder.get() != null;
    }
}
