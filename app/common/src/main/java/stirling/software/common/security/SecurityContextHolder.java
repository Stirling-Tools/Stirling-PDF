package stirling.software.common.security;

/**
 * Migration compatibility shim for
 * {@code org.springframework.security.core.context.SecurityContextHolder}.
 *
 * <p>Associates a {@link SecurityContext} with the current thread of execution using a
 * {@link ThreadLocal}.
 */
public final class SecurityContextHolder {

    private static final ThreadLocal<SecurityContext> CONTEXT_HOLDER = new ThreadLocal<>();

    private SecurityContextHolder() {}

    /**
     * Returns the context for the current thread, creating an empty one if none is set.
     */
    public static SecurityContext getContext() {
        SecurityContext context = CONTEXT_HOLDER.get();
        if (context == null) {
            context = createEmptyContext();
            CONTEXT_HOLDER.set(context);
        }
        return context;
    }

    public static void setContext(SecurityContext context) {
        CONTEXT_HOLDER.set(context);
    }

    public static void clearContext() {
        CONTEXT_HOLDER.remove();
    }

    public static SecurityContext createEmptyContext() {
        return new SecurityContextImpl();
    }
}
