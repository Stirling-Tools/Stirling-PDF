package stirling.software.saas.service;

import java.util.*;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.audit.*;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.*;
import stirling.software.proprietary.service.AuditService;

/** Transfers an existing team's leadership without moving wallets, subscriptions or identities. */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class SaasOwnershipService {
    private final TeamRepository teams;
    private final TeamMembershipRepository memberships;
    private final SaasTeamExtensionService extensions;
    private final EntityManager entityManager;
    private final AuditService audit;

    @Transactional
    public void transfer(Long teamId, Long targetId, User caller) {
        var team =
                teams.lockById(teamId)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (extensions.isPersonal(team))
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Personal teams cannot transfer ownership.");
        List<TeamMembership> rows = memberships.findByTeamId(teamId);
        // Method-security checks may already have loaded these entities before the lock.
        rows.forEach(entityManager::refresh);
        TeamMembership actor =
                rows.stream()
                        .filter(
                                m ->
                                        m.getUser().getId().equals(caller.getId())
                                                && m.getAcceptedAt() != null)
                        .findFirst()
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        boolean unowned = rows.stream().noneMatch(TeamMembership::isLeader);
        if (!actor.isLeader() && !(unowned && caller.getId().equals(targetId)))
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Only the current leader can transfer ownership.");
        if (!unowned && caller.getId().equals(targetId))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose another member.");
        TeamMembership target =
                rows.stream()
                        .filter(
                                m ->
                                        m.getUser().getId().equals(targetId)
                                                && m.getAcceptedAt() != null
                                                && m.getUser().isEnabled()
                                                && m.getUser().getTeam() != null
                                                && m.getUser().getTeam().getId().equals(teamId))
                        .findFirst()
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.BAD_REQUEST,
                                                "Choose an active member of this team."));
        rows.stream().filter(TeamMembership::isLeader).forEach(m -> m.setRole(TeamRole.MEMBER));
        target.setRole(TeamRole.LEADER);
        memberships.flush();
        audit.audit(
                caller.getUsername(),
                AuditEventType.ORG_OWNERSHIP_CHANGE,
                Map.of(
                        "teamId",
                        teamId,
                        "newOwnerUserId",
                        targetId,
                        "source",
                        unowned ? "RECOVERY" : "TRANSFER"),
                AuditLevel.BASIC);
    }
}
