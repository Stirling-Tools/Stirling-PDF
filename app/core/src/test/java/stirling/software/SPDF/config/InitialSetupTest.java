package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

class InitialSetupTest {

    private ApplicationProperties applicationProperties;
    private ApplicationProperties.AutomaticallyGenerated autoGen;
    private ApplicationProperties.Legal legal;
    private InitialSetup initialSetup;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        autoGen = applicationProperties.getAutomaticallyGenerated();
        legal = applicationProperties.getLegal();
        initialSetup = new InitialSetup(applicationProperties);
    }

    @Nested
    @DisplayName("initUUIDKey")
    class UuidKey {

        @Test
        @DisplayName("generates and persists a UUID when missing")
        void generatesWhenMissing() throws Exception {
            autoGen.setUUID(null);
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                util.when(() -> GeneralUtils.isValidUUID(null)).thenReturn(false);

                initialSetup.initUUIDKey();

                assertThat(autoGen.getUUID()).isNotBlank();
                util.verify(
                        () ->
                                GeneralUtils.saveKeyToSettings(
                                        eq("AutomaticallyGenerated.UUID"), any()),
                        times(1));
            }
        }

        @Test
        @DisplayName("keeps an existing valid UUID")
        void keepsValid() throws Exception {
            autoGen.setUUID("existing");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                util.when(() -> GeneralUtils.isValidUUID("existing")).thenReturn(true);

                initialSetup.initUUIDKey();

                assertThat(autoGen.getUUID()).isEqualTo("existing");
                util.verify(() -> GeneralUtils.saveKeyToSettings(any(), any()), never());
            }
        }
    }

    @Nested
    @DisplayName("initSecretKey")
    class SecretKey {

        @Test
        @DisplayName("generates a key when invalid")
        void generatesWhenInvalid() throws Exception {
            autoGen.setKey(null);
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                util.when(() -> GeneralUtils.isValidUUID(null)).thenReturn(false);

                initialSetup.initSecretKey();

                assertThat(autoGen.getKey()).isNotBlank();
                util.verify(
                        () ->
                                GeneralUtils.saveKeyToSettings(
                                        eq("AutomaticallyGenerated.key"), any()),
                        times(1));
            }
        }

        @Test
        @DisplayName("keeps an existing valid key")
        void keepsValid() throws Exception {
            autoGen.setKey("secret");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                util.when(() -> GeneralUtils.isValidUUID("secret")).thenReturn(true);

                initialSetup.initSecretKey();

                assertThat(autoGen.getKey()).isEqualTo("secret");
            }
        }
    }

    @Nested
    @DisplayName("initLegalUrls")
    class LegalUrls {

        @Test
        @DisplayName("sets defaults when both URLs are empty")
        void setsDefaults() throws Exception {
            legal.setTermsAndConditions(null);
            legal.setPrivacyPolicy("");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                initialSetup.initLegalUrls();

                assertThat(legal.getTermsAndConditions()).contains("stirlingpdf.com/terms");
                assertThat(legal.getPrivacyPolicy()).contains("privacy-policy");
                util.verify(
                        () -> GeneralUtils.saveKeyToSettings(eq("legal.termsAndConditions"), any()),
                        times(1));
                util.verify(
                        () -> GeneralUtils.saveKeyToSettings(eq("legal.privacyPolicy"), any()),
                        times(1));
            }
        }

        @Test
        @DisplayName("preserves already-configured URLs")
        void preservesExisting() throws Exception {
            legal.setTermsAndConditions("https://example.com/t");
            legal.setPrivacyPolicy("https://example.com/p");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                initialSetup.initLegalUrls();

                assertThat(legal.getTermsAndConditions()).isEqualTo("https://example.com/t");
                util.verify(() -> GeneralUtils.saveKeyToSettings(any(), any()), never());
            }
        }
    }

    @Nested
    @DisplayName("initSetAppVersion")
    class AppVersion {

        @Test
        @DisplayName("flags new server when version is missing")
        void newServerWhenMissing() throws Exception {
            autoGen.setAppVersion(null);
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                initialSetup.initSetAppVersion();

                assertThat(autoGen.getIsNewServer()).isTrue();
                assertThat(autoGen.getAppVersion()).isNotNull();
            }
        }

        @Test
        @DisplayName("flags new server when version is 0.0.0")
        void newServerWhenZero() throws Exception {
            autoGen.setAppVersion("0.0.0");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                initialSetup.initSetAppVersion();

                assertThat(autoGen.getIsNewServer()).isTrue();
            }
        }

        @Test
        @DisplayName("existing server keeps not-new flag")
        void existingServer() throws Exception {
            autoGen.setAppVersion("1.2.3");
            try (MockedStatic<GeneralUtils> util = mockStatic(GeneralUtils.class)) {
                initialSetup.initSetAppVersion();

                assertThat(autoGen.getIsNewServer()).isFalse();
            }
        }
    }
}
