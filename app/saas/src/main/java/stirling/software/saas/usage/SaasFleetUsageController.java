package stirling.software.saas.usage;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.api.usage.FleetUsageStats;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * SaaS counterpart to {@code FleetUsageController}: the same "Free PDF Editors" figures, scoped to
 * the caller's team (one SaaS backend serves many tenants, so the self-hosted server-wide variant
 * is disabled here via {@code @Profile("!saas")}).
 *
 * <ul>
 *   <li>editorsDeployed — number of team members ({@code team_memberships}), not seat limits;
 *   <li>activeThisMonth — distinct members with a free-UI ("WEB", non-{@code UI_DATA}) audit event
 *       in the last 30 days, clamped to a subset of deployed;
 *   <li>pdfsProcessed — the team's cumulative free-UI PDF/file operations.
 * </ul>
 *
 * <p>Team resolution + membership mirror {@code PaygWalletController}. Audit-derived figures are
 * null (rendered "N/A") when EE auditing is below STANDARD. Cost is always $0 (client literal).
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/usage")
@Profile("saas")
@RequiredArgsConstructor
public class SaasFleetUsageController {

    private static final List<String> PDF_TYPES = List.of("PDF_PROCESS", "FILE_OPERATION");

    private final UserRepository userRepository;
    private final TeamMembershipRepository memberRepo;
    private final PersistentAuditEventRepository auditRepository;
    private final AuditConfigurationProperties auditConfig;

    @GetMapping("/fleet-stats")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<FleetUsageStats> fleetStats(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<TeamMembership> primary = memberRepo.findPrimaryMembership(user.getId());
        if (primary.isEmpty()) {
            // Authenticated caller without a team — shouldn't happen post-migration; report an
            // empty fleet rather than 500.
            return ResponseEntity.ok(new FleetUsageStats(0L, null, null));
        }
        Long teamId = primary.get(0).getTeam().getId();

        List<String> members =
                memberRepo.findByTeamId(teamId).stream()
                        .map(m -> m.getUser().getUsername())
                        .toList();
        Long deployed = (long) members.size();

        // Guard the empty IN-list (invalid JPQL) as well as the audit-level gate.
        boolean auditOn = !members.isEmpty() && auditConfig.isLevelEnabled(AuditLevel.STANDARD);
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);
        Long active =
                auditOn
                        ? auditRepository
                                .countDistinctPrincipalsBySourceExcludingTypeAndPrincipalInAfter(
                                        "WEB", "UI_DATA", members, since)
                        : null;
        Long pdfs =
                auditOn
                        ? auditRepository.countByTypeInAndSourceAndPrincipalInAndTimestampAfter(
                                PDF_TYPES, "WEB", members, Instant.EPOCH)
                        : null;
        if (active != null && active > deployed) {
            active = deployed; // active editors are a subset of those deployed
        }
        return ResponseEntity.ok(new FleetUsageStats(deployed, active, pdfs));
    }
}
