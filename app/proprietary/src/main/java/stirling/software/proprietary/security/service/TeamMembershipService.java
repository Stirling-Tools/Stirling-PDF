package stirling.software.proprietary.security.service;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.eclipse.microprofile.config.Config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * Keeps team_memberships in step with users.team_id on self-hosted admin flows and holds the
 * team-owner (LEADER role) mutations. SaaS owns membership lifecycle (seats, personal teams,
 * last-leader guards) via SaasTeamService, so these mutations no-op on the saas profile to avoid
 * corrupting its accounting.
 */
@ApplicationScoped
@RequiredArgsConstructor
public class TeamMembershipService {

    private final TeamMembershipRepository membershipRepository;
    private final Config config;

    private boolean isSaas() {
        // Spring's Environment.getActiveProfiles() -> the Quarkus profile(s), comma separated.
        String activeProfiles = config.getOptionalValue("quarkus.profile", String.class).orElse("");
        return Arrays.asList(activeProfiles.split(",")).contains("saas");
    }

    /** Reflects users.team_id into membership rows, preserving an existing role on the team. */
    @Transactional
    public void syncMembership(User user) {
        if (isSaas() || user == null || user.getId() == null) {
            return;
        }
        Long teamId = user.getTeam() != null ? user.getTeam().getId() : null;
        boolean present = false;
        for (TeamMembership row : membershipRepository.findByUserId(user.getId())) {
            if (teamId != null && teamId.equals(row.getTeam().getId())) {
                present = true;
            } else {
                membershipRepository.delete(row);
            }
        }
        if (teamId != null && !present) {
            membershipRepository.save(newRow(user.getTeam(), user, TeamRole.MEMBER));
        }
    }

    /** Promotes a member to team owner, creating the membership row if it is missing. */
    @Transactional
    public void setOwner(Team team, User user) {
        if (isSaas()) {
            return;
        }
        Optional<TeamMembership> existing =
                membershipRepository.findByTeamIdAndUserId(team.getId(), user.getId());
        if (existing.isPresent()) {
            existing.get().setRole(TeamRole.LEADER);
            membershipRepository.save(existing.get());
        } else {
            membershipRepository.save(newRow(team, user, TeamRole.LEADER));
        }
    }

    /** Demotes a team owner back to member; keeps the membership row. */
    @Transactional
    public void removeOwner(Team team, User user) {
        if (isSaas()) {
            return;
        }
        membershipRepository
                .findByTeamIdAndUserId(team.getId(), user.getId())
                .ifPresent(
                        row -> {
                            row.setRole(TeamRole.MEMBER);
                            membershipRepository.save(row);
                        });
    }

    /** Owner user ids for a team. */
    @Transactional
    public List<Long> ownerUserIds(Long teamId) {
        return membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER).stream()
                .map(row -> row.getUser().getId())
                .toList();
    }

    @Transactional
    public void deleteAllForTeam(Long teamId) {
        membershipRepository.deleteByTeamId(teamId);
    }

    @Transactional
    public void deleteAllForUser(User user) {
        membershipRepository.deleteByUserId(user.getId());
        membershipRepository.clearInvitedBy(user);
    }

    private TeamMembership newRow(Team team, User user, TeamRole role) {
        TeamMembership row = new TeamMembership();
        row.setTeam(team);
        row.setUser(user);
        row.setRole(role);
        // Self-hosted rows are admin-assigned, not invitation-driven.
        row.setInvitedAt(LocalDateTime.now());
        row.setAcceptedAt(LocalDateTime.now());
        return row;
    }
}
