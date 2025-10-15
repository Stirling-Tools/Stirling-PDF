package stirling.software.proprietary.controller.web;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;

@Controller
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@EnterpriseEndpoint
public class AuditDashboardWebController {
    private final AuditConfigurationProperties auditConfig;

    /** Display the audit dashboard. */
    @GetMapping("/audit")
    @Hidden
    public String showDashboard(Model model) {
        model.addAttribute("auditEnabled", auditConfig.isEnabled());
        model.addAttribute("auditLevel", auditConfig.getAuditLevel());
        model.addAttribute("auditLevelInt", auditConfig.getLevel());
        model.addAttribute("retentionDays", auditConfig.getRetentionDays());

        // Add audit level enum values for display
        model.addAttribute("auditLevels", AuditLevel.values());

        // Add audit event types for the dropdown
        model.addAttribute("auditEventTypes", AuditEventType.values());

        return "audit/dashboard";
    }
}
