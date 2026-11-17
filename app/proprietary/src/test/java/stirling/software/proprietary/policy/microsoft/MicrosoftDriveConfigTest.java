package stirling.software.proprietary.policy.microsoft;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class MicrosoftDriveConfigTest {

    private static Map<String, Object> credentials(String drive) {
        Map<String, Object> options = new HashMap<>();
        options.put("drive", drive);
        options.put("tenantId", "contoso.onmicrosoft.com");
        options.put("clientId", "client");
        options.put("clientSecret", "s3cret");
        return options;
    }

    @Test
    void parsesAOneDriveConnection() {
        Map<String, Object> options = credentials("onedrive");
        options.put("user", "finance@contoso.com");
        options.put("directory", "/Inbox/Scans/");
        options.put("mode", "snapshot");
        options.put("recursive", "true");

        MicrosoftDriveConfig config = MicrosoftDriveConfig.fromConnection(options);

        assertEquals(MicrosoftDrive.ONEDRIVE, config.drive());
        assertEquals("Inbox/Scans", config.directory());
        assertTrue(config.snapshot());
        assertTrue(config.recursive());
        assertEquals("contoso.onmicrosoft.com:onedrive:finance@contoso.com", config.location());
    }

    @Test
    void parsesASharePointSiteAndLibrary() {
        Map<String, Object> options = credentials("sharepoint");
        options.put("siteUrl", "https://contoso.sharepoint.com/sites/Finance/");
        options.put("library", "Invoices");

        MicrosoftDriveConfig config = MicrosoftDriveConfig.fromConnection(options);

        assertEquals("contoso.sharepoint.com", config.siteHost());
        assertEquals("sites/Finance", config.sitePath());
        assertEquals("Invoices", config.library());
        assertFalse(config.snapshot());
    }

    @Test
    void theRootSiteHasNoPathAndTheDefaultLibraryIsOptional() {
        Map<String, Object> options = credentials("sharepoint");
        options.put("siteUrl", "https://contoso.sharepoint.com");

        MicrosoftDriveConfig config = MicrosoftDriveConfig.fromConnection(options);

        assertEquals("", config.sitePath());
        assertNull(config.library());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "http://contoso.sharepoint.com/sites/a",
                "https://contoso.sharepoint.com/sites/a?x=1",
                "https://user@contoso.sharepoint.com/sites/a",
                "not a url"
            })
    void rejectsSiteUrlsThatAreNotPlainHttps(String url) {
        Map<String, Object> options = credentials("sharepoint");
        options.put("siteUrl", url);
        assertThrows(
                IllegalArgumentException.class, () -> MicrosoftDriveConfig.fromConnection(options));
    }

    @ParameterizedTest
    @CsvSource({"directory, Inbox/../../Other", "tenantId, evil/../x"})
    void rejectsAnEscapingFolderOrTenant(String key, String value) {
        Map<String, Object> options = credentials("onedrive");
        options.put("user", "finance@contoso.com");
        options.put(key, value);
        assertThrows(
                IllegalArgumentException.class, () -> MicrosoftDriveConfig.fromConnection(options));
    }

    @Test
    void requiresTheCredentialsAndTheLibraryOwner() {
        assertThrows(
                IllegalArgumentException.class,
                () -> MicrosoftDriveConfig.fromConnection(credentials("onedrive")));
        Map<String, Object> noSecret = credentials("sharepoint");
        noSecret.put("siteUrl", "https://contoso.sharepoint.com");
        noSecret.remove("clientSecret");
        assertThrows(
                IllegalArgumentException.class,
                () -> MicrosoftDriveConfig.fromConnection(noSecret));
        Map<String, Object> noDrive = credentials("dropbox");
        assertThrows(
                IllegalArgumentException.class, () -> MicrosoftDriveConfig.fromConnection(noDrive));
    }

    @Test
    void neverPrintsTheSecret() {
        Map<String, Object> options = credentials("onedrive");
        options.put("user", "finance@contoso.com");
        assertFalse(MicrosoftDriveConfig.fromConnection(options).toString().contains("s3cret"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"tenantId", "clientId", "clientSecret"})
    void requiresItsOwnAppRegistration(String key) {
        Map<String, Object> options = credentials("onedrive");
        options.put("user", "finance@contoso.com");
        options.remove(key);
        assertThrows(
                IllegalArgumentException.class, () -> MicrosoftDriveConfig.fromConnection(options));
    }

    @ParameterizedTest
    @ValueSource(strings = {"common", "organizations", "consumers"})
    void rejectsATenantThatIsNotOneOrganisation(String tenant) {
        Map<String, Object> options = credentials("onedrive");
        options.put("user", "finance@contoso.com");
        options.put("tenantId", tenant);
        assertThrows(
                IllegalArgumentException.class, () -> MicrosoftDriveConfig.fromConnection(options));
    }

    @Test
    void aConnectedAccountTakesAPathOrAFolderLink() {
        MicrosoftDriveConfig mine =
                MicrosoftDriveConfig.forAccount(
                        MicrosoftDrive.ONEDRIVE, 7L, Map.of("directory", "/Scans/In/"));
        assertEquals("Scans/In", mine.directory());
        assertNull(mine.folderLink());
        assertEquals("account:7", mine.location());

        MicrosoftDriveConfig linked =
                MicrosoftDriveConfig.forAccount(
                        MicrosoftDrive.SHAREPOINT,
                        7L,
                        Map.of("directory", "https://contoso.sharepoint.com/:f:/s/Finance/abc"));
        assertEquals("https://contoso.sharepoint.com/:f:/s/Finance/abc", linked.folderLink());
        assertEquals("", linked.directory());

        assertThrows(
                IllegalArgumentException.class,
                () ->
                        MicrosoftDriveConfig.forAccount(
                                MicrosoftDrive.SHAREPOINT, 7L, Map.of("directory", "Shared")));
        assertThrows(
                IllegalArgumentException.class,
                () ->
                        MicrosoftDriveConfig.forAccount(
                                MicrosoftDrive.ONEDRIVE,
                                7L,
                                Map.of("directory", "https://user:pw@evil.example/x")));
    }
}
