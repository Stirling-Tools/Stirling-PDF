package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.controller.api.misc.LoginDisclaimerController.LoginDisclaimerResponse;
import stirling.software.common.service.LoginAgreementService;

@ExtendWith(MockitoExtension.class)
class LoginDisclaimerControllerTest {

    @Mock LoginAgreementService loginAgreementService;

    @InjectMocks LoginDisclaimerController controller;

    @Test
    void disabledReturnsEmptyContent() {
        when(loginAgreementService.isEnabled()).thenReturn(false);
        when(loginAgreementService.isShowInAnonymousMode()).thenReturn(true);

        LoginDisclaimerResponse resp = controller.getLoginDisclaimer("en-GB");

        assertFalse(resp.enabled());
        assertEquals("", resp.content());
        assertTrue(resp.showInAnonymousMode());
        assertEquals("markdown", resp.format());
    }

    @Test
    void enabledWithContentReturnsIt() {
        when(loginAgreementService.isEnabled()).thenReturn(true);
        when(loginAgreementService.isShowInAnonymousMode()).thenReturn(false);
        when(loginAgreementService.resolveContent("fr-FR")).thenReturn("# Avis");

        LoginDisclaimerResponse resp = controller.getLoginDisclaimer("fr-FR");

        assertTrue(resp.enabled());
        assertEquals("# Avis", resp.content());
        assertFalse(resp.showInAnonymousMode());
    }

    @Test
    void enabledButBlankContentReportsDisabled() {
        // No file for any candidate locale and no fallbackText -> report disabled so clients
        // don't render an empty agreement.
        when(loginAgreementService.isEnabled()).thenReturn(true);
        when(loginAgreementService.isShowInAnonymousMode()).thenReturn(true);
        when(loginAgreementService.resolveContent("ja-JP")).thenReturn("   ");

        LoginDisclaimerResponse resp = controller.getLoginDisclaimer("ja-JP");

        assertFalse(resp.enabled());
        assertEquals("", resp.content());
    }
}
