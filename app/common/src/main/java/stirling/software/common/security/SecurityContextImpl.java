package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.context.SecurityContextImpl}.
 *
 * <p>Basic concrete implementation of {@link SecurityContext}.
 */
public class SecurityContextImpl implements SecurityContext {

    private Authentication authentication;

    public SecurityContextImpl() {}

    public SecurityContextImpl(Authentication authentication) {
        this.authentication = authentication;
    }

    @Override
    public Authentication getAuthentication() {
        return authentication;
    }

    @Override
    public void setAuthentication(Authentication authentication) {
        this.authentication = authentication;
    }
}
