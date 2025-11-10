package stirling.software.proprietary.controller.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ui.ConcurrentModel;
import org.springframework.ui.Model;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.config.AuditConfigurationProperties;

class AuditDashboardWebControllerTest {

    private AuditConfigurationProperties auditConfig;
    private AuditDashboardWebController controller;

    @BeforeEach
    void setUp() {
        auditConfig = mock(AuditConfigurationProperties.class);
        controller = new AuditDashboardWebController(auditConfig);
    }

    @Test
    void showDashboardAddsExpectedAttributesAndReturnsView() {
        when(auditConfig.isEnabled()).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);
        when(auditConfig.getLevel()).thenReturn(3);
        when(auditConfig.getRetentionDays()).thenReturn(30);

        Model model = new ConcurrentModel();

        String viewName = controller.showDashboard(model);

        assertEquals("audit/dashboard", viewName);
        assertEquals(true, model.getAttribute("auditEnabled"));
        assertEquals(AuditLevel.VERBOSE, model.getAttribute("auditLevel"));
        assertEquals(3, model.getAttribute("auditLevelInt"));
        assertEquals(30, model.getAttribute("retentionDays"));
        assertArrayEquals(AuditLevel.values(), (AuditLevel[]) model.getAttribute("auditLevels"));
        assertArrayEquals(
                AuditEventType.values(), (AuditEventType[]) model.getAttribute("auditEventTypes"));

        verify(auditConfig).isEnabled();
        verify(auditConfig).getAuditLevel();
        verify(auditConfig).getLevel();
        verify(auditConfig).getRetentionDays();
        verifyNoMoreInteractions(auditConfig);
    }
}
