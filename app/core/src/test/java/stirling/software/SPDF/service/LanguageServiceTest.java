package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Ui;

class LanguageServiceTest {

    private LanguageService languageService;
    private ApplicationProperties applicationProperties;

    private static Resource createMockResource(String filename) {
        Resource mockResource = mock(Resource.class);
        when(mockResource.getFilename()).thenReturn(filename);
        return mockResource;
    }

    @BeforeEach
    void setUp() {
        applicationProperties = mock(ApplicationProperties.class);
        Ui ui = mock(Ui.class);
        when(applicationProperties.getUi()).thenReturn(ui);
        languageService = new LanguageServiceForTest(applicationProperties);
    }

    @Test
    void testGetSupportedLanguages_NoRestrictions() {
        Set<String> expectedLanguages =
                new HashSet<>(Arrays.asList("en_US", "fr_FR", "de_DE", "en_GB"));
        Resource[] mockResources = createMockResources(expectedLanguages);
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertEquals(
                expectedLanguages,
                supportedLanguages,
                "Should return all languages when no restrictions");
    }

    @Test
    void testGetSupportedLanguages_WithRestrictions() {
        Set<String> expectedLanguages =
                new HashSet<>(Arrays.asList("en_US", "fr_FR", "de_DE", "en_GB"));
        Set<String> allowedLanguages = new HashSet<>(Arrays.asList("en_US", "fr_FR"));
        Resource[] mockResources = createMockResources(expectedLanguages);
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);
        when(applicationProperties.getUi().getLanguages())
                .thenReturn(Arrays.asList("en_US", "fr_FR"));
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertEquals(
                allowedLanguages, supportedLanguages, "Should return only whitelisted languages");
        assertFalse(
                supportedLanguages.contains("en_GB"),
                "en_GB should NOT be included when not in whitelist");
        assertFalse(
                supportedLanguages.contains("de_DE"),
                "de_DE should NOT be included when not in whitelist");
    }

    @Test
    void testGetSupportedLanguages_ExceptionHandling() {
        ((LanguageServiceForTest) languageService).setShouldThrowException(true);
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertTrue(supportedLanguages.isEmpty(), "Should return empty set on exception");
    }

    private Resource[] createMockResources(Set<String> languages) {
        return languages.stream()
                .map(lang -> createMockResource("messages_" + lang + ".properties"))
                .toArray(Resource[]::new);
    }

    @Test
    void testGetSupportedLanguages_FilteringNonMatchingFiles() {
        Resource[] mixedResources = {
            createMockResource("messages_en_US.properties"),
            createMockResource("messages_en_GB.properties"),
            createMockResource("messages_fr_FR.properties"),
            createMockResource("not_a_messages_file.properties"),
            createMockResource("messages_.properties"),
            createMockResource(null)
        };
        ((LanguageServiceForTest) languageService).setMockResources(mixedResources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertTrue(supportedLanguages.contains("en_US"), "en_US should be included");
        assertTrue(supportedLanguages.contains("fr_FR"), "fr_FR should be included");
        assertTrue(supportedLanguages.contains("en_GB"), "en_GB should always be included");
        assertFalse(
                supportedLanguages.contains("not_a_messages_file"),
                "Invalid format should be excluded");
    }

    @Test
    void testGetSupportedLanguages_SingleLanguage() {
        Resource[] resources = {createMockResource("messages_ja_JP.properties")};
        ((LanguageServiceForTest) languageService).setMockResources(resources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertEquals(1, supportedLanguages.size());
        assertTrue(supportedLanguages.contains("ja_JP"));
    }

    @Test
    void testGetSupportedLanguages_EmptyResources() {
        ((LanguageServiceForTest) languageService).setMockResources(new Resource[0]);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertTrue(supportedLanguages.isEmpty());
    }

    @Test
    void testGetSupportedLanguages_WhitelistWithNoMatchingResources() {
        Resource[] resources = {createMockResource("messages_en_US.properties")};
        ((LanguageServiceForTest) languageService).setMockResources(resources);
        when(applicationProperties.getUi().getLanguages())
                .thenReturn(Arrays.asList("fr_FR", "de_DE"));
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertTrue(supportedLanguages.isEmpty());
    }

    @Test
    void testGetSupportedLanguages_AllResourcesFilteredByNull() {
        Resource[] resources = {createMockResource(null), createMockResource(null)};
        ((LanguageServiceForTest) languageService).setMockResources(resources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertTrue(supportedLanguages.isEmpty());
    }

    @Test
    void testGetSupportedLanguages_WhitelistExactlyMatchesResources() {
        Resource[] resources = {
            createMockResource("messages_en_US.properties"),
            createMockResource("messages_fr_FR.properties")
        };
        ((LanguageServiceForTest) languageService).setMockResources(resources);
        when(applicationProperties.getUi().getLanguages())
                .thenReturn(Arrays.asList("en_US", "fr_FR"));
        Set<String> supportedLanguages = languageService.getSupportedLanguages();
        assertEquals(2, supportedLanguages.size());
        assertTrue(supportedLanguages.contains("en_US"));
        assertTrue(supportedLanguages.contains("fr_FR"));
    }

    private static class LanguageServiceForTest extends LanguageService {
        private Resource[] mockResources;
        private boolean shouldThrowException = false;

        public LanguageServiceForTest(ApplicationProperties applicationProperties) {
            super(applicationProperties);
        }

        public void setMockResources(Resource[] mockResources) {
            this.mockResources = mockResources;
        }

        public void setShouldThrowException(boolean shouldThrowException) {
            this.shouldThrowException = shouldThrowException;
        }

        @Override
        protected Resource[] getResourcesFromPattern(String pattern) throws IOException {
            if (shouldThrowException) {
                throw new IOException("Test exception");
            }
            return mockResources;
        }
    }
}
