package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.context.SecurityContext}.
 *
 * <p>Holds the {@link Authentication} associated with the current execution.
 */
public interface SecurityContext {

    Authentication getAuthentication();

    void setAuthentication(Authentication authentication);
}
