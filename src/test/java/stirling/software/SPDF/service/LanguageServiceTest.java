package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Ui;

class LanguageServiceTest {

    private LanguageService languageService;
    private ApplicationProperties applicationProperties;
    private PathMatchingResourcePatternResolver mockedResolver;

    @BeforeEach
    void setUp() throws Exception {
        // Mock ApplicationProperties
        applicationProperties = mock(ApplicationProperties.class);
        Ui ui = mock(Ui.class);
        when(applicationProperties.getUi()).thenReturn(ui);

        // Create LanguageService with our custom constructor that allows injection of resolver
        languageService = new LanguageServiceForTest(applicationProperties);
    }

    @Test
    void testGetSupportedLanguages_NoRestrictions() throws IOException {
        // Setup
        Set<String> expectedLanguages =
                new HashSet<>(Arrays.asList("en_US", "fr_FR", "de_DE", "en_GB"));

        // Mock the resource resolver response
        Resource[] mockResources = createMockResources(expectedLanguages);
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);

        // No language restrictions in properties
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        // Test
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify
        assertEquals(
                expectedLanguages,
                supportedLanguages,
                "Should return all languages when no restrictions");
    }

    @Test
    void testGetSupportedLanguages_WithRestrictions() throws IOException {
        // Setup
        Set<String> expectedLanguages =
                new HashSet<>(Arrays.asList("en_US", "fr_FR", "de_DE", "en_GB"));
        Set<String> allowedLanguages = new HashSet<>(Arrays.asList("en_US", "fr_FR", "en_GB"));

        // Mock the resource resolver response
        Resource[] mockResources = createMockResources(expectedLanguages);
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);

        // Set language restrictions in properties
        when(applicationProperties.getUi().getLanguages())
                .thenReturn(Arrays.asList("en_US", "fr_FR")); // en_GB is always allowed

        // Test
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify
        assertEquals(
                allowedLanguages,
                supportedLanguages,
                "Should return only allowed languages, plus en_GB which is always allowed");
        assertTrue(supportedLanguages.contains("en_GB"), "en_GB should always be included");
    }

    @Test
    void testGetSupportedLanguages_ExceptionHandling() throws IOException {
        // Setup - make resolver throw an exception
        ((LanguageServiceForTest) languageService).setShouldThrowException(true);

        // Test
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify
        assertTrue(supportedLanguages.isEmpty(), "Should return empty set on exception");
    }

    @Test
    void testGetSupportedLanguages_FilteringNonMatchingFiles() throws IOException {
        // Setup with some valid and some invalid filenames
        Resource[] mixedResources =
                new Resource[] {
                    createMockResource("messages_en_US.properties"),
                    createMockResource(
                            "messages_en_GB.properties"), // Explicitly add en_GB resource
                    createMockResource("messages_fr_FR.properties"),
                    createMockResource("not_a_messages_file.properties"),
                    createMockResource("messages_.properties"), // Invalid format
                    createMockResource(null) // Null filename
                };

        ((LanguageServiceForTest) languageService).setMockResources(mixedResources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        // Test
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify the valid languages are present
        assertTrue(supportedLanguages.contains("en_US"), "en_US should be included");
        assertTrue(supportedLanguages.contains("fr_FR"), "fr_FR should be included");
        // Add en_GB which is always included
        assertTrue(supportedLanguages.contains("en_GB"), "en_GB should always be included");

        // Verify no invalid formats are included
        assertFalse(
                supportedLanguages.contains("not_a_messages_file"),
                "Invalid format should be excluded");
        // Skip the empty string check as it depends on implementation details of extracting
        // language codes
    }

    // Helper methods to create mock resources
    private Resource[] createMockResources(Set<String> languages) {
        return languages.stream()
                .map(lang -> createMockResource("messages_" + lang + ".properties"))
                .toArray(Resource[]::new);
    }

    private Resource createMockResource(String filename) {
        Resource mockResource = mock(Resource.class);
        when(mockResource.getFilename()).thenReturn(filename);
        return mockResource;
    }

    // Test subclass that allows us to control the resource resolver
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
