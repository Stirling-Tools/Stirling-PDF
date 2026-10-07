package stirling.software.saas.sso;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.config.SupabaseConfigurationProperties;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.service.SaasTeamExtensionService;

/** Owns the explicit two-login conversion and atomic SSO admission; never merges by email alone. */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class CompanySsoService {
    private final CompanySsoProperties properties;
    private final SupabaseConfigurationProperties supabase;
    private final CompanySsoStore store;
    private final CompanySsoPolicy policy;
    private final SupabaseSamlAdmin admin;
    private final UserRepository users;
    private final TeamRepository teams;
    private final TeamMembershipRepository memberships;
    private final SaasTeamExtensionsRepository seats;
    private final SaasTeamExtensionService teamExtensions;

    public record Settings(
            boolean eligible,
            UUID connectionId,
            boolean active,
            boolean tested,
            List<Long> connectedUserIds,
            String entityId,
            String acsUrl) {}

    public record LoginStart(String attempt, UUID providerId, String teamName) {}

    public record Completed(boolean active, String teamName) {}

    /**
     * Reads only the current team; entitlement is assigned by the operator, never by the browser.
     */
    public Settings settings(Jwt jwt) {
        User user = originalOrAdmitted(jwt, false);
        long teamId = user.getTeam().getId();
        requireLeader(teamId, user);
        boolean eligible =
                properties.isEnabled() && properties.getEligibleTeamIds().contains(teamId);
        var connection = eligible ? store.team(teamId).orElse(null) : null;
        return new Settings(
                eligible,
                connection == null ? null : connection.id(),
                connection != null && connection.active(),
                connection != null && connection.testedBy() != null,
                connection == null ? List.of() : store.connectedUsers(teamId),
                supabase.getIssuer() + "/saml/metadata",
                supabase.getIssuer() + "/saml/acs");
    }

    /** Serialises configuration changes with activation and invalidates tests of older metadata. */
    @Transactional
    public void save(Jwt jwt, String metadataXml) {
        User user = originalOrAdmitted(jwt, true);
        Team team = teams.lockById(user.getTeam().getId()).orElseThrow();
        requireEligible(team.getId());
        requireLeader(team.getId(), user);
        var previous = store.team(team.getId()).orElse(null);
        if (previous != null && previous.active()) {
            throw error("CONNECTION_ACTIVE", "Contact support to change an active SSO connection.");
        }
        UUID provider = admin.save(previous == null ? null : previous.providerId(), metadataXml);
        store.save(
                new CompanySsoStore.Connection(
                        previous == null ? UUID.randomUUID() : previous.id(),
                        team.getId(),
                        provider,
                        false,
                        previous == null ? 1 : previous.revision() + 1,
                        null));
    }

    /**
     * Only verified company domains participate in discovery; email is a routing hint, not proof.
     */
    public UUID discover(String email) {
        if (!properties.isEnabled() || email == null || email.length() > 254)
            throw error("COMPANY_NOT_FOUND", "Use the sign-in link from your team leader.");
        int at = email.lastIndexOf('@');
        Long teamId =
                properties
                        .getVerifiedDomains()
                        .get(email.substring(at + 1).trim().toLowerCase(Locale.ROOT));
        if (at < 1 || teamId == null)
            throw error("COMPANY_NOT_FOUND", "Use the sign-in link from your team leader.");
        return store.team(teamId)
                .filter(CompanySsoStore.Connection::active)
                .orElseThrow(
                        () ->
                                error(
                                        "COMPANY_NOT_FOUND",
                                        "Use the sign-in link from your team leader."))
                .id();
    }

    /** The unguessable attempt is kept in this browser tab and expires after ten minutes. */
    @Transactional
    public LoginStart start(UUID connectionId, Jwt originalJwt) {
        var connection = connection(connectionId);
        User original = originalJwt == null ? null : originalOrAdmitted(originalJwt, true);
        if (original != null) requireMember(connection.teamId(), original);
        if (!connection.active()) {
            if (original == null)
                throw error("CONNECTION_NOT_ACTIVE", "Your team leader is still setting up SSO.");
            requireLeader(connection.teamId(), original);
        }
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String attempt = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        store.start(
                hash(attempt),
                connection,
                original == null ? null : original.getId(),
                Instant.now());
        return new LoginStart(
                attempt,
                connection.providerId(),
                teams.findById(connection.teamId()).orElseThrow().getName());
    }

    /**
     * Admits a fresh SAML session once. Refreshes and retries cannot recreate a removed membership.
     */
    @Transactional
    public Completed complete(String token, Jwt company, Jwt originalJwt) {
        var attempt = store.lockAttempt(hash(token));
        var connection = connection(attempt.connectionId());
        Team team = teams.lockById(connection.teamId()).orElseThrow();
        connection = connection(attempt.connectionId());
        Instant now = Instant.now();
        if (!now.isBefore(attempt.expiresAt()) || attempt.revision() != connection.revision()) {
            throw error("ATTEMPT_EXPIRED", "Start company sign-in again.");
        }
        var login =
                CompanySsoClaims.saml(company)
                        .orElseThrow(
                                () ->
                                        error(
                                                "WRONG_PROVIDER",
                                                "Use this company's SSO connection."));
        if (!login.providerId().equals(connection.providerId())
                || login.authenticatedAt().isBefore(attempt.createdAt().minusSeconds(5))
                || login.authenticatedAt().isAfter(now.plusSeconds(5))) {
            throw error(
                    "WRONG_PROVIDER", "Start a fresh sign-in with this company's SSO connection.");
        }
        UUID authId = UUID.fromString(company.getSubject());
        UUID sessionId = UUID.fromString(company.getClaimAsString("session_id"));
        if (store.sessionUsed(sessionId))
            throw error("SESSION_ALREADY_USED", "Start a fresh company sign-in.");
        var binding = store.binding(authId).orElse(null);
        Long originalId = attempt.originalUserId();
        if (originalJwt != null) {
            User original = originalOrAdmitted(originalJwt, true);
            requireMember(team.getId(), original);
            if (originalId != null && !originalId.equals(original.getId()))
                throw error("ACCOUNT_MISMATCH", "Use the account that started this connection.");
            originalId = original.getId();
        }
        User user;
        if (binding != null) {
            if (binding.teamId() != team.getId()
                    || (originalId != null && originalId != binding.userId()))
                throw error(
                        "ACCOUNT_MISMATCH",
                        "This company identity is already connected to another account.");
            user = users.findById(binding.userId()).orElseThrow();
        } else if (originalId != null) {
            user = users.findById(originalId).orElseThrow();
            requireMember(team.getId(), user);
            if (store.userBinding(user.getId()).isPresent())
                throw error(
                        "ACCOUNT_MISMATCH",
                        "This account already has a company identity. Contact support.");
        } else {
            if (!connection.active())
                throw error("CONNECTION_NOT_ACTIVE", "Your team leader is still setting up SSO.");
            String email = company.getClaimAsString("email");
            if (email == null || email.isBlank() || email.length() > 254)
                throw error(
                        "EMAIL_REQUIRED",
                        "Ask your company administrator to include your email address in SAML.");
            if (users.findByEmailIgnoreCase(email).isPresent()
                    || users.findByUsernameIgnoreCase(email).isPresent()
                    || users.findBySupabaseId(authId).isPresent()) {
                throw error(
                        "ACCOUNT_CONNECTION_REQUIRED",
                        "Sign in to your existing Stirling account to connect it to company SSO.");
            }
            user = new User();
            user.setUsername(email);
            user.setEmail(email);
            user.setEnabled(true);
            user.setFirstLogin(false);
            user.setAuthenticationType(AuthenticationType.OAUTH2);
            user.setSupabaseId(authId);
            user.setTeam(team);
            user.setRoleName(Role.PRO_USER.getRoleId());
            user.addAuthority(new Authority(Role.PRO_USER.getRoleId(), user));
            user = users.saveAndFlush(user);
        }
        if (!user.isEnabled())
            throw error("ACCOUNT_DISABLED", "Your account is disabled. Contact your team leader.");
        if (!connection.active()) requireLeader(team.getId(), user);
        TeamMembership membership =
                memberships.findByTeamIdAndUserId(team.getId(), user.getId()).orElse(null);
        if (membership == null) {
            if (!connection.active())
                throw error("CONNECTION_NOT_ACTIVE", "Your team leader is still setting up SSO.");
            if (seats.incrementSeatsUsed(team.getId()) != 1)
                throw error(
                        "TEAM_FULL", "Your team has no available seats. Contact your team leader.");
            membership = new TeamMembership();
            membership.setTeam(team);
            membership.setUser(user);
            membership.setRole(TeamRole.MEMBER);
            membership.setInvitedAt(LocalDateTime.now());
            membership.setAcceptedAt(LocalDateTime.now());
            membership = memberships.saveAndFlush(membership);
            user.getAuthorities().stream()
                    .filter(a -> Role.USER.getRoleId().equals(a.getAuthority()))
                    .forEach(a -> a.setAuthority(Role.PRO_USER.getRoleId()));
            if (Role.PRO_USER.getRoleId().equals(user.getRolesAsString()))
                user.setRoleName(Role.PRO_USER.getRoleId());
        }
        user.setTeam(team);
        users.saveAndFlush(user);
        if (binding == null) store.bind(authId, user.getId(), team.getId());
        store.admit(sessionId, user.getId(), team.getId(), membership.getMembershipId());
        if (!connection.active()) store.tested(connection, user.getId());
        store.consume(hash(token));
        return new Completed(connection.active(), team.getName());
    }

    /**
     * Activation requires the same leader to have successfully connected on this metadata revision.
     */
    @Transactional
    public void activate(Jwt jwt) {
        User user = originalOrAdmitted(jwt, true);
        Team team = teams.lockById(user.getTeam().getId()).orElseThrow();
        requireEligible(team.getId());
        requireLeader(team.getId(), user);
        var connection = store.team(team.getId()).orElseThrow();
        if (!user.getId().equals(connection.testedBy())
                || store.userBinding(user.getId()).isEmpty())
            throw error(
                    "TEST_REQUIRED",
                    "Test SSO and connect your own account before enabling it for the team.");
        teamExtensions.setPersonal(team, false);
        store.activate(connection.id());
    }

    private User originalOrAdmitted(Jwt jwt, boolean recent) {
        if (jwt == null || Boolean.TRUE.equals(jwt.getClaimAsBoolean("is_anonymous")))
            throw error("SIGN_IN_REQUIRED", "Sign in to your existing Stirling account.");
        if (recent && !CompanySsoClaims.hasRecentPrimaryLogin(jwt, Instant.now()))
            throw error("REAUTHENTICATE", "Sign in to your existing account again, then retry.");
        User user =
                CompanySsoClaims.isSaml(jwt)
                        ? policy.resolve(jwt).orElseThrow()
                        : users.findBySupabaseId(UUID.fromString(jwt.getSubject()))
                                .orElseThrow(
                                        () ->
                                                error(
                                                        "ACCOUNT_NOT_FOUND",
                                                        "Sign in to your existing Stirling account first."));
        if (!user.isEnabled() || user.getTeam() == null)
            throw error("ACCOUNT_DISABLED", "Your account has no active team. Contact support.");
        return user;
    }

    private CompanySsoStore.Connection connection(UUID id) {
        if (!properties.isEnabled()) throw error("SSO_UNAVAILABLE", "Company SSO is unavailable.");
        return store.connection(id)
                .orElseThrow(
                        () ->
                                error(
                                        "COMPANY_NOT_FOUND",
                                        "Use the sign-in link from your team leader."));
    }

    private void requireEligible(long teamId) {
        if (!properties.isEnabled() || !properties.getEligibleTeamIds().contains(teamId))
            throw error(
                    "ENTERPRISE_REQUIRED",
                    "Contact Stirling to enable enterprise SSO for this team.");
    }

    private TeamMembership requireMember(long teamId, User user) {
        if (user.getTeam() == null || user.getTeam().getId() != teamId)
            throw error("WRONG_TEAM", "Connect an existing account that belongs to this team.");
        return memberships
                .findByTeamIdAndUserId(teamId, user.getId())
                .orElseThrow(
                        () ->
                                error(
                                        "WRONG_TEAM",
                                        "Connect an existing account that belongs to this team."));
    }

    private void requireLeader(long teamId, User user) {
        if (!requireMember(teamId, user).isLeader())
            throw error("LEADER_REQUIRED", "Only a team leader can configure SSO.");
    }

    private static String hash(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}"))
            throw error("ATTEMPT_EXPIRED", "Start company sign-in again.");
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(token.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static CompanySsoException error(String code, String message) {
        return new CompanySsoException(code, message);
    }
}
