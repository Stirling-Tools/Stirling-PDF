package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties.Driver;
import stirling.software.common.model.ApplicationProperties.Premium;
import stirling.software.common.model.ApplicationProperties.Security;
import stirling.software.common.model.exception.UnsupportedProviderException;

class ApplicationPropertiesLogicTest {

    @Test
    void system_isAnalyticsEnabled_null_false_true() {
        ApplicationProperties.System sys = new ApplicationProperties.System();

        sys.setEnableAnalytics(null);
        assertFalse(sys.isAnalyticsEnabled());

        sys.setEnableAnalytics(Boolean.FALSE);
        assertFalse(sys.isAnalyticsEnabled());

        sys.setEnableAnalytics(Boolean.TRUE);
        assertTrue(sys.isAnalyticsEnabled());
    }

    @Test
    void tempFileManagement_defaults_and_overrides() {
        ApplicationProperties.TempFileManagement tfm =
                new ApplicationProperties.TempFileManagement();

        String expectedBase =
                java.lang.System.getProperty("java.io.tmpdir").replaceAll("/+$", "")
                        + "/stirling-pdf";
        assertEquals(expectedBase, tfm.getBaseTmpDir());

        String expectedLibre = expectedBase + "/libreoffice";
        assertEquals(expectedLibre, tfm.getLibreofficeDir());

        tfm.setBaseTmpDir("/custom/base");
        assertEquals("/custom/base", tfm.getBaseTmpDir());

        tfm.setLibreofficeDir("/opt/libre");
        assertEquals("/opt/libre", tfm.getLibreofficeDir());
    }

    @Test
    void oauth2_scope_parsing_and_validity() {
        Security.OAUTH2 oauth2 = new Security.OAUTH2();
        oauth2.setIssuer("https://issuer");
        oauth2.setClientId("client");
        oauth2.setClientSecret("secret");
        oauth2.setUseAsUsername("email");
        oauth2.setScopes("openid, profile ,email");
        assertTrue(oauth2.isSettingsValid());
    }

    @Test
    void security_login_method_flags() {
        Security sec = new Security();

        sec.getOauth2().setEnabled(true);
        sec.getSaml2().setEnabled(true);

        assertTrue(sec.isUserPass());
        assertTrue(sec.isOauth2Active());
        assertTrue(sec.isSaml2Active());

        sec.setLoginMethod(Security.LoginMethods.NORMAL.toString());
        assertTrue(sec.isUserPass());
        assertFalse(sec.isOauth2Active());
        assertFalse(sec.isSaml2Active());
    }

    @Test
    void security_isAltLogin_reflects_oauth2_or_saml2() {
        Security sec = new Security();

        assertFalse(sec.isAltLogin());

        sec.getOauth2().setEnabled(true);
        sec.getSaml2().setEnabled(false);
        assertTrue(sec.isAltLogin());

        sec.getOauth2().setEnabled(false);
        sec.getSaml2().setEnabled(true);
        assertTrue(sec.isAltLogin());

        sec.getOauth2().setEnabled(true);
        sec.getSaml2().setEnabled(true);
        assertTrue(sec.isAltLogin());
    }

    @Test
    void oauth2_client_provider_mapping_and_unsupported() throws UnsupportedProviderException {
        Security.OAUTH2.Client client = new Security.OAUTH2.Client();

        assertNotNull(client.get("google"));
        assertNotNull(client.get("github"));
        assertNotNull(client.get("keycloak"));

        UnsupportedProviderException ex =
                assertThrows(UnsupportedProviderException.class, () -> client.get("unknown"));
        assertTrue(ex.getMessage().toLowerCase().contains("not supported"));
    }

    @Test
    void premium_google_drive_getters_return_empty_string_on_null_or_blank() {
        Premium.ProFeatures.GoogleDrive gd = new Premium.ProFeatures.GoogleDrive();

        assertEquals("", gd.getClientId());
        assertEquals("", gd.getApiKey());
        assertEquals("", gd.getAppId());

        gd.setClientId(" id ");
        gd.setApiKey(" key ");
        gd.setAppId(" app ");
        assertEquals(" id ", gd.getClientId());
        assertEquals(" key ", gd.getApiKey());
        assertEquals(" app ", gd.getAppId());
    }

    @Test
    void ui_getters_return_null_for_blank() {
        ApplicationProperties.Ui ui = new ApplicationProperties.Ui();
        ui.setAppName("   ");
        ui.setHomeDescription("");
        ui.setAppNameNavbar(null);

        assertNull(ui.getAppName());
        assertNull(ui.getHomeDescription());
        assertNull(ui.getAppNameNavbar());

        ui.setAppName("Stirling-PDF");
        ui.setHomeDescription("Home");
        ui.setAppNameNavbar("Nav");
        assertEquals("Stirling-PDF", ui.getAppName());
        assertEquals("Home", ui.getHomeDescription());
        assertEquals("Nav", ui.getAppNameNavbar());
    }

    @Test
    void driver_toString_contains_driver_name() {
        assertTrue(Driver.H2.toString().contains("h2"));
        assertTrue(Driver.POSTGRESQL.toString().contains("postgresql"));
    }

    @Test
    void session_limits_and_timeouts_have_reasonable_defaults() {
        ApplicationProperties.ProcessExecutor pe = new ApplicationProperties.ProcessExecutor();

        ApplicationProperties.ProcessExecutor.SessionLimit s = pe.getSessionLimit();
        assertEquals(2, s.getQpdfSessionLimit());
        assertEquals(1, s.getTesseractSessionLimit());
        assertEquals(1, s.getLibreOfficeSessionLimit());
        assertEquals(1, s.getPdfToHtmlSessionLimit());
        assertEquals(8, s.getPythonOpenCvSessionLimit());
        assertEquals(16, s.getWeasyPrintSessionLimit());
        assertEquals(1, s.getInstallAppSessionLimit());
        assertEquals(1, s.getCalibreSessionLimit());
        assertEquals(8, s.getGhostscriptSessionLimit());
        assertEquals(2, s.getOcrMyPdfSessionLimit());

        ApplicationProperties.ProcessExecutor.TimeoutMinutes t = pe.getTimeoutMinutes();
        assertEquals(30, t.getTesseractTimeoutMinutes());
        assertEquals(30, t.getQpdfTimeoutMinutes());
        assertEquals(30, t.getLibreOfficeTimeoutMinutes());
        assertEquals(20, t.getPdfToHtmlTimeoutMinutes());
        assertEquals(30, t.getPythonOpenCvTimeoutMinutes());
        assertEquals(30, t.getWeasyPrintTimeoutMinutes());
        assertEquals(60, t.getInstallAppTimeoutMinutes());
        assertEquals(30, t.getCalibreTimeoutMinutes());
        assertEquals(30, t.getGhostscriptTimeoutMinutes());
        assertEquals(30, t.getOcrMyPdfTimeoutMinutes());
    }

    @Deprecated
    @Test
    void enterprise_metadata_defaults() {
        ApplicationProperties.EnterpriseEdition ee = new ApplicationProperties.EnterpriseEdition();
        ApplicationProperties.EnterpriseEdition.CustomMetadata eMeta = ee.getCustomMetadata();
        eMeta.setCreator("  ");
        eMeta.setProducer(null);
        assertEquals("Stirling-PDF", eMeta.getCreator());
        assertEquals("Stirling-PDF", eMeta.getProducer());
    }

    @Test
    void premium_metadata_defaults() {
        Premium.ProFeatures pf = new Premium.ProFeatures();
        Premium.ProFeatures.CustomMetadata pMeta = pf.getCustomMetadata();
        pMeta.setCreator("");
        pMeta.setProducer("");
        assertEquals("Stirling-PDF", pMeta.getCreator());
        assertEquals("Stirling-PDF", pMeta.getProducer());
    }

    @Test
    void premium_metadata_awesome() {
        Premium.ProFeatures pf = new Premium.ProFeatures();
        Premium.ProFeatures.CustomMetadata pMeta = pf.getCustomMetadata();
        pMeta.setCreator("Awesome PDF Tool");
        pMeta.setProducer("Awesome PDF Tool");
        assertEquals("Awesome PDF Tool", pMeta.getCreator());
        assertEquals("Awesome PDF Tool", pMeta.getProducer());
    }

    @Test
    void string_isValid_handles_null_empty_blank_and_trimmed() {
        ApplicationProperties.Security.OAUTH2 oauth2 = new ApplicationProperties.Security.OAUTH2();

        assertFalse(oauth2.isValid((String) null, "issuer"));
        assertFalse(oauth2.isValid("", "issuer"));
        assertFalse(oauth2.isValid("   ", "issuer"));

        assertTrue(oauth2.isValid("x", "issuer"));
        assertTrue(oauth2.isValid("  x  ", "issuer")); // trimmt intern
    }

    @Test
    void collection_isValid_handles_null_and_empty() {
        ApplicationProperties.Security.OAUTH2 oauth2 = new ApplicationProperties.Security.OAUTH2();

        Collection<String> nullColl = null;
        Collection<String> empty = List.of();

        assertFalse(oauth2.isValid(nullColl, "scopes"));
        assertFalse(oauth2.isValid(empty, "scopes"));
    }

    @Test
    void collection_isValid_true_when_non_empty_even_if_element_is_blank() {
        ApplicationProperties.Security.OAUTH2 oauth2 = new ApplicationProperties.Security.OAUTH2();

        // Aktuelles Verhalten: prüft NUR !isEmpty(), nicht Inhalt
        Collection<String> oneBlank = new ArrayList<>();
        oneBlank.add("   ");

        assertTrue(
                oauth2.isValid(oneBlank, "scopes"),
                "Dokumentiert aktuelles Verhalten: nicht-leere Liste gilt als gültig, auch wenn Element leer/blank ist");
    }
}
