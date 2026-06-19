package stirling.software.common.security;

import java.util.Objects;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.core.authority.SimpleGrantedAuthority}.
 *
 * <p>A basic, immutable {@link GrantedAuthority} backed by a single string.
 */
public class SimpleGrantedAuthority implements GrantedAuthority {

    private final String authority;

    public SimpleGrantedAuthority(String authority) {
        this.authority = authority;
    }

    @Override
    public String getAuthority() {
        return authority;
    }

    @Override
    public boolean equals(Object obj) {
        if (this == obj) {
            return true;
        }
        if (!(obj instanceof SimpleGrantedAuthority)) {
            return false;
        }
        SimpleGrantedAuthority other = (SimpleGrantedAuthority) obj;
        return Objects.equals(authority, other.authority);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(authority);
    }

    @Override
    public String toString() {
        return authority;
    }
}
