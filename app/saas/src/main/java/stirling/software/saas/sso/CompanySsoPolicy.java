package stirling.software.saas.sso;

import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/** Enforces company sessions against current membership, including after removal and rejoining. */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class CompanySsoPolicy {
    private final CompanySsoStore store;
    private final UserRepository users;
    private final TeamMembershipRepository memberships;

    /**
     * Resolves an admitted company identity without changing the user's original billing identity.
     */
    public Optional<User> resolve(Jwt jwt) {
        var binding = store.binding(UUID.fromString(jwt.getSubject()));
        if (binding.isEmpty()) {
            if (CompanySsoClaims.isSaml(jwt)) throw required(null);
            return Optional.empty();
        }
        User user = users.findById(binding.get().userId()).orElseThrow(() -> required(null));
        assertAccess(user, jwt);
        return Optional.of(user);
    }

    /** A null JWT denotes an API key: human company accounts must use an admitted SSO session. */
    public void assertAccess(User user, Jwt jwt) {
        var binding = store.userBinding(user.getId());
        var connection = binding.flatMap(b -> store.team(b.teamId()));
        if (!user.isEnabled()
                && (binding.isPresent() || (jwt != null && CompanySsoClaims.isSaml(jwt))))
            throw required(connection.map(CompanySsoStore.Connection::id).orElse(null));
        if (jwt != null && CompanySsoClaims.isSaml(jwt)) {
            var c = connection.orElseThrow(() -> required(null));
            var login = CompanySsoClaims.saml(jwt).orElseThrow(() -> required(c.id()));
            var membership =
                    memberships
                            .findByTeamIdAndUserId(c.teamId(), user.getId())
                            .orElseThrow(() -> required(c.id()));
            if (!binding.orElseThrow().authId().toString().equals(jwt.getSubject())
                    || !c.providerId().equals(login.providerId())
                    || user.getTeam() == null
                    || user.getTeam().getId() != c.teamId()
                    || !store.admitted(
                            UUID.fromString(jwt.getClaimAsString("session_id")),
                            user.getId(),
                            membership.getMembershipId())) {
                throw required(c.id());
            }
            return;
        }
        if (connection.filter(CompanySsoStore.Connection::active).isPresent()) {
            throw required(connection.orElseThrow().id());
        }
        for (var membership : memberships.findByUserId(user.getId())) {
            var managed =
                    store.team(membership.getTeam().getId())
                            .filter(CompanySsoStore.Connection::active);
            if (managed.isPresent()) throw required(managed.orElseThrow().id());
        }
    }

    public boolean isManaged(long teamId) {
        return store.team(teamId).filter(CompanySsoStore.Connection::active).isPresent();
    }

    /** Also called by self-removal through the leader API; hiding Leave alone is insufficient. */
    public void assertCanLeave(long teamId) {
        if (isManaged(teamId))
            throw new IllegalStateException(
                    "Your company manages this team. Ask a team leader to remove you.");
    }

    /** Invitations cannot bypass SSO or move a company member into a different billing team. */
    public void assertCanAcceptInvitation(User user, long targetTeamId) {
        assertCanLeave(targetTeamId);
        for (var membership : memberships.findByUserId(user.getId())) {
            assertCanLeave(membership.getTeam().getId());
        }
        store.userBinding(user.getId()).ifPresent(b -> assertCanLeave(b.teamId()));
    }

    private static CompanySsoException required(UUID connection) {
        return new CompanySsoException(
                "COMPANY_SSO_REQUIRED", "Continue with your company's single sign-on.", connection);
    }
}
