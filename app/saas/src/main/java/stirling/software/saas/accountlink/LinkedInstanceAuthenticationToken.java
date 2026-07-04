package stirling.software.saas.accountlink;

import java.util.List;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Authentication for a linked self-hosted instance (combined-billing "Mode A").
 *
 * <p>Deliberately <em>not</em> a user: the principal is the instance ({@code instanceId}) bound to
 * a {@code teamId}, with the single authority {@code ROLE_LINKED_INSTANCE}. It carries no {@code
 * User} and creates no user row — a device credential can never act as a person, only as its team's
 * instance, and only on the instance-facing endpoints.
 */
public class LinkedInstanceAuthenticationToken extends AbstractAuthenticationToken {

    private final Long instanceId;
    private final Long teamId;

    public LinkedInstanceAuthenticationToken(Long instanceId, Long teamId) {
        super(List.of(new SimpleGrantedAuthority("ROLE_LINKED_INSTANCE")));
        this.instanceId = instanceId;
        this.teamId = teamId;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return null; // the secret is never retained on the authentication
    }

    @Override
    public Object getPrincipal() {
        return instanceId;
    }

    public Long getInstanceId() {
        return instanceId;
    }

    public Long getTeamId() {
        return teamId;
    }
}
