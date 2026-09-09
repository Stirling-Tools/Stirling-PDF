package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Unit tests for {@link LoginAgreementService}. The service resolves per-language markdown from
 * {@code <customFiles>/disclaimer/<locale>.md}; here {@link
 * InstallationPathConfig#getCustomFilesPath()} is mocked to a {@link TempDir} so file IO is
 * isolated.
 */
class LoginAgreementServiceTest {

    @TempDir Path customFilesDir;

    private ApplicationProperties properties;
    private ApplicationProperties.Legal.LoginAgreement config;
    private LoginAgreementService service;
    private Path disclaimerDir;

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        config = properties.getLegal().getLoginAgreement();
        service = new LoginAgreementService(properties);
        disclaimerDir = customFilesDir.resolve("disclaimer");
    }

    /**
     * Run {@code action} with InstallationPathConfig.getCustomFilesPath() pointing at the temp dir.
     */
    private void withMockedPath(Runnable action) {
        try (MockedStatic<InstallationPathConfig> mocked =
                mockStatic(InstallationPathConfig.class)) {
            mocked.when(InstallationPathConfig::getCustomFilesPath)
                    .thenReturn(customFilesDir.toString());
            action.run();
        }
    }

    private void writeFile(String locale, String content) throws IOException {
        Files.createDirectories(disclaimerDir);
        Files.writeString(disclaimerDir.resolve(locale + ".md"), content, StandardCharsets.UTF_8);
    }

    @Test
    void flagsReflectConfig() {
        config.setEnabled(true);
        config.setShowInAnonymousMode(false);
        assertTrue(service.isEnabled());
        assertFalse(service.isShowInAnonymousMode());
    }

    @Test
    void resolveContentReturnsExactLocaleFile() throws IOException {
        writeFile("fr-FR", "# Avis");
        withMockedPath(() -> assertEquals("# Avis", service.resolveContent("fr-FR")));
    }

    @Test
    void resolveContentFallsBackToBaseLanguage() throws IOException {
        // Only a language-only file exists; a region-specific request should fall back to it.
        writeFile("de", "# Hinweis");
        withMockedPath(() -> assertEquals("# Hinweis", service.resolveContent("de-DE")));
    }

    @Test
    void resolveContentFallsBackToDefaultLocale() throws IOException {
        properties.getSystem().setDefaultLocale("en-GB");
        writeFile("en-GB", "# Notice");
        // No file for the requested locale -> falls through to the configured default locale.
        withMockedPath(() -> assertEquals("# Notice", service.resolveContent("es-ES")));
    }

    @Test
    void resolveContentFallsBackToFallbackTextWhenNoFile() {
        config.setFallbackText("# Fallback");
        withMockedPath(() -> assertEquals("# Fallback", service.resolveContent("ja-JP")));
    }

    @Test
    void resolveContentReturnsEmptyWhenNothingConfigured() {
        withMockedPath(() -> assertEquals("", service.resolveContent("ja-JP")));
    }

    @Test
    void resolveContentDoesNotEscapeDisclaimerDirectory() throws IOException {
        // Plant a file outside the disclaimer dir; a traversal-style locale must not read it.
        Files.writeString(
                customFilesDir.resolve("secret.md"), "TOP SECRET", StandardCharsets.UTF_8);
        config.setFallbackText("safe");
        withMockedPath(
                () -> {
                    assertEquals("safe", service.resolveContent("../secret"));
                    assertEquals("safe", service.resolveContent("..%2Fsecret"));
                    assertEquals("safe", service.resolveContent("/etc/passwd"));
                });
    }

    @Test
    void readRawRejectsInvalidLocale() {
        withMockedPath(
                () -> {
                    assertNull(service.readRawForLocale("../secret"));
                    assertNull(service.readRawForLocale("en/GB"));
                    assertNull(service.readRawForLocale("C:\\x"));
                    assertNull(service.readRawForLocale(null));
                });
    }

    @Test
    void readRawReturnsEmptyForValidButAbsentLocale() {
        withMockedPath(() -> assertEquals("", service.readRawForLocale("pt-BR")));
    }

    @Test
    void overlongLocaleIsRejectedWithoutStackOverflow() {
        // Guards against the regex-recursion stack overflow on unbounded input.
        String hostile = "en" + "-ab".repeat(4000);
        withMockedPath(
                () -> {
                    assertDoesNotThrow(() -> service.readRawForLocale(hostile));
                    assertNull(service.readRawForLocale(hostile));
                    assertDoesNotThrow(() -> service.resolveContent(hostile));
                });
    }

    @Test
    void writeThenReadRoundTrips() throws IOException {
        withMockedPath(
                () -> {
                    assertDoesNotThrow(() -> service.writeForLocale("fr-FR", "# Bonjour"));
                    assertEquals("# Bonjour", service.readRawForLocale("fr-FR"));
                });
        assertTrue(Files.isRegularFile(disclaimerDir.resolve("fr-FR.md")));
    }

    @Test
    void writeBlankDeletesFile() throws IOException {
        writeFile("fr-FR", "# Bonjour");
        withMockedPath(
                () -> {
                    assertDoesNotThrow(() -> service.writeForLocale("fr-FR", "   "));
                    assertEquals("", service.readRawForLocale("fr-FR"));
                });
        assertFalse(Files.exists(disclaimerDir.resolve("fr-FR.md")));
    }

    @Test
    void writeRejectsInvalidLocale() {
        withMockedPath(
                () ->
                        assertThrows(
                                IllegalArgumentException.class,
                                () -> service.writeForLocale("../escape", "x")));
    }

    @Test
    void listLocalesWithContentReturnsOnlyValidMarkdownFiles() throws IOException {
        writeFile("en-GB", "a");
        writeFile("fr-FR", "b");
        Files.writeString(disclaimerDir.resolve("notes.txt"), "x", StandardCharsets.UTF_8);
        withMockedPath(
                () -> {
                    var locales = service.listLocalesWithContent();
                    assertTrue(locales.contains("en-GB"));
                    assertTrue(locales.contains("fr-FR"));
                    assertEquals(2, locales.size());
                });
    }

    @Test
    void oversizedFileIsIgnored() throws IOException {
        // Files beyond the read cap are skipped rather than loaded into heap.
        byte[] big = new byte[300 * 1024];
        java.util.Arrays.fill(big, (byte) 'x');
        Files.createDirectories(disclaimerDir);
        Files.write(disclaimerDir.resolve("en-GB.md"), big);
        config.setFallbackText("small-fallback");
        properties.getSystem().setDefaultLocale("en-GB");
        withMockedPath(() -> assertEquals("small-fallback", service.resolveContent("en-GB")));
    }
}
