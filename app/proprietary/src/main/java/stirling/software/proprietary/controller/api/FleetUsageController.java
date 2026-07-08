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

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.model.api.usage.FleetUsageStats;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;

/**
 * Admin endpoint exposing free-editor fleet usage for the portal Usage card. Audit-derived figures
 * (active editors, PDFs processed) are null (rendered as "N/A") when EE auditing is disabled, since
 * they are then uncomputable.
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
        Long deployed = userRepository.count();
        boolean auditOn = auditConfig.isEnabled();
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
