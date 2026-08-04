package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code org.springframework.security.core.GrantedAuthority}.
 *
 * <p>Represents an authority granted to an {@link Authentication} object. Provided so that code
 * migrated from Spring Boot to Quarkus compiles without Spring Security on the classpath.
 */
public interface GrantedAuthority {

    /**
     * Returns a textual representation of the granted authority.
     *
     * @return the authority string, never {@code null}
     */
    String getAuthority();
}
