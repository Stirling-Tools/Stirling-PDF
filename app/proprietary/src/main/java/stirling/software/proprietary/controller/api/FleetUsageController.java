package stirling.software.proprietary.controller.api;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.api.usage.FleetUsageStats;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;

/**
 * Admin endpoint exposing free-editor fleet usage for the portal Usage card. Audit-derived figures
 * (active editors, PDFs processed) are null (rendered as "N/A") rather than a misleading 0 whenever
 * the data can't exist: the events they count (PDF_PROCESS, FILE_OPERATION, HTTP_REQUEST) are all
 * STANDARD level, so a gate on {@code isEnabled()} alone would still return 0 at level=OFF/BASIC —
 * we gate on {@code isLevelEnabled(STANDARD)} instead.
 *
 * <p>Known limitation: on a login-disabled self-hosted instance every request is anonymous, so its
 * audit origin is SYSTEM (not WEB) and it is excluded from these WEB-only counts — active/PDFs then
 * read 0 despite real usage. Historical audit rows written before the {@code source} column existed
 * carry {@code source=null}, so the cumulative "PDFs edited" figure effectively starts at deploy.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/usage")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class FleetUsageController {

    private final PersistentAuditEventRepository auditRepository;
    private final UserRepository userRepository;
    private final AuditConfigurationProperties auditConfig;

    @GetMapping("/fleet-stats")
    public FleetUsageStats fleetStats() {
        // Exclude the reserved INTERNAL_API_USER row that InitialSecuritySetup creates on every
        // install, so a fresh single-admin instance reads 1 editor, not 2.
        Long deployed = userRepository.countByUsernameNot(Role.INTERNAL_API_USER.getRoleId());
        // STANDARD is the level at which the counted events are recorded; below it the data
        // can't exist, so report N/A instead of a 0 that would misrepresent an empty table.
        boolean auditOn = auditConfig.isLevelEnabled(AuditLevel.STANDARD);
        Instant since = Instant.now().minus(30, ChronoUnit.DAYS);
        Long active =
                auditOn
                        ? auditRepository.countDistinctPrincipalsBySourceExcludingTypeAfter(
                                "WEB", "UI_DATA", since)
                        : null;
        Long pdfs =
                auditOn
                        ? auditRepository.countByTypeInAndSourceAndTimestampAfter(
                                List.of("PDF_PROCESS", "FILE_OPERATION"), "WEB", Instant.EPOCH)
                        : null;
        if (active != null && deployed != null && active > deployed) {
            active = deployed; // active editors are a subset of those deployed
        }
        return new FleetUsageStats(deployed, active, pdfs);
    }
}
