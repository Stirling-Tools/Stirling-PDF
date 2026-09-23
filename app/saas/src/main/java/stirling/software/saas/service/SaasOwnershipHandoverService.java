package stirling.software.saas.service;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.accountlink.CloudOwnershipCandidates;
import stirling.software.proprietary.accountlink.CloudOwnershipStatus;
import stirling.software.proprietary.accountlink.CloudOwnershipStatus.State;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.accountlink.LinkedInstance;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.repository.TeamInvitationRepository;

/**
 * Resolves successors inside one team; a device never supplies the human authorization to transfer.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class SaasOwnershipHandoverService {
    private final TeamRepository teams;
    private final TeamMembershipRepository memberships;
    private final LinkedInstanceRepository instances;
    private final TeamBillingService billing;
    private final SaasTeamService invitations;
    private final SaasOwnershipService ownership;
    private final SaasTeamExtensionService extensions;
    private final EntityManager entities;
    private final TeamInvitationRepository pendingInvitations;

    /**
     * Excludes the current owner, unaccepted invitations, disabled accounts and departed members.
     */
    @Transactional(readOnly = true)
    public CloudOwnershipCandidates candidates(Long teamId) {
        var team =
                teams.findById(teamId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "CLOUD_TEAM_MISSING"));
        var members =
                memberships.findByTeamId(teamId).stream()
                        .filter(m -> !m.isLeader() && eligible(m, teamId, m.getUser().getEmail()))
                        .map(
                                m ->
                                        new CloudOwnershipCandidates.Member(
                                                m.getUser().getId(),
                                                m.getUser().getUsername(),
                                                m.getUser().getEmail()))
                        .sorted(
                                java.util.Comparator.comparing(
                                        CloudOwnershipCandidates.Member::email,
                                        String.CASE_INSENSITIVE_ORDER))
                        .toList();
        return new CloudOwnershipCandidates(teamId, team.getName(), members);
    }

    /** Rejects email reassignment or membership changes after the local server pins an account. */
    @Transactional(readOnly = true)
    public CloudOwnershipStatus status(Long teamId, String email, Long expectedTargetId) {
        var result = status(teamId, email);
        if (expectedTargetId != null && !Objects.equals(result.targetUserId(), expectedTargetId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CLOUD_TARGET_CHANGED");
        }
        return result;
    }

    /** Resolves only accepted, enabled recipients currently attached to the specified team. */
    @Transactional(readOnly = true)
    public CloudOwnershipStatus status(Long teamId, String email) {
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EMAIL_REQUIRED");
        }
        var team =
                teams.findById(teamId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "CLOUD_TEAM_MISSING"));
        List<TeamMembership> rows = memberships.findByTeamId(teamId);
        Long leader =
                rows.stream()
                        .filter(TeamMembership::isLeader)
                        .map(m -> m.getUser().getId())
                        .min(Long::compareTo)
                        .orElse(null);
        var target = rows.stream().filter(m -> eligible(m, teamId, email)).findFirst();
        State state =
                target.map(m -> m.isLeader() ? State.TRANSFERRED : State.READY)
                        .orElse(State.NEEDS_MEMBERSHIP);
        return new CloudOwnershipStatus(
                teamId,
                team.getName(),
                leader,
                target.map(m -> m.getUser().getId()).orElse(null),
                instances.countByTeamIdAndRevokedAtIsNull(teamId),
                billing.forTeam(teamId).subscribed(),
                state);
    }

    /** Serializes with other ownership changes and rejects a confirmation of a stale leader. */
    @Transactional
    public CloudOwnershipStatus change(
            Long teamId, String email, Long expectedLeaderId, User caller, String action) {
        return change(teamId, email, expectedLeaderId, caller, action, null, null);
    }

    /**
     * Only the device-authenticated endpoint may supply an instance; the human owner is rechecked.
     */
    @Transactional
    public CloudOwnershipStatus changeFromInstance(
            LinkedInstance instance,
            String email,
            Long expectedLeaderId,
            User caller,
            String action) {
        return changeFromInstance(instance, email, expectedLeaderId, caller, action, null);
    }

    /** Revalidates the selected account under the same team lock used for ownership changes. */
    @Transactional
    public CloudOwnershipStatus changeFromInstance(
            LinkedInstance instance,
            String email,
            Long expectedLeaderId,
            User caller,
            String action,
            Long expectedTargetId) {
        return change(
                instance.getTeamId(),
                email,
                expectedLeaderId,
                caller,
                action,
                instance,
                expectedTargetId);
    }

    private CloudOwnershipStatus change(
            Long teamId,
            String email,
            Long expectedLeaderId,
            User caller,
            String action,
            LinkedInstance instance,
            Long expectedTargetId) {
        var team =
                teams.lockById(teamId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        memberships.findByTeamId(teamId).forEach(entities::refresh);
        var actor =
                memberships
                        .findByTeamIdAndUserId(teamId, caller.getId())
                        .filter(
                                m ->
                                        m.isLeader()
                                                && m.getAcceptedAt() != null
                                                && caller.isEnabled())
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.FORBIDDEN, "CLOUD_OWNER_REQUIRED"));
        CloudOwnershipStatus before = status(teamId, email, expectedTargetId);
        if (!Objects.equals(before.leaderUserId(), expectedLeaderId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CLOUD_OWNER_CHANGED");
        }
        if ("invite".equals(action)) {
            if (before.state() == State.NEEDS_MEMBERSHIP) {
                String address = email.strip().toLowerCase(java.util.Locale.ROOT);
                pendingInvitations.markExpiredInvitations(java.time.LocalDateTime.now());
                if (!pendingInvitations.existsPendingInvitationByTeamIdAndEmail(teamId, address)) {
                    try {
                        invitations.inviteUserToTeam(teamId, address, actor.getUser());
                    } catch (IllegalArgumentException | IllegalStateException e) {
                        throw new ResponseStatusException(
                                HttpStatus.BAD_REQUEST, "INVITATION_BLOCKED");
                    }
                }
            }
        } else if ("transfer".equals(action)) {
            if (extensions.isPersonal(team))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PERSONAL_TEAM");
            if (before.state() == State.NEEDS_MEMBERSHIP)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "MEMBERSHIP_REQUIRED");
            if (before.state() != State.TRANSFERRED) {
                if (instance == null) ownership.transfer(teamId, before.targetUserId(), caller);
                else
                    ownership.transferFromInstance(teamId, before.targetUserId(), caller, instance);
            }
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return status(teamId, email);
    }

    private boolean eligible(TeamMembership membership, Long teamId, String email) {
        User user = membership.getUser();
        return membership.getAcceptedAt() != null
                && email != null
                && !email.isBlank()
                && user.isEnabled()
                && user.getEmail() != null
                && user.getEmail().equalsIgnoreCase(email.strip())
                && user.getTeam() != null
                && (membership.isLeader() || Objects.equals(user.getTeam().getId(), teamId));
    }
}
