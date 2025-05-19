package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Ui;

class LanguageServiceBasicTest {

    private LanguageService languageService;
    private ApplicationProperties applicationProperties;

    @BeforeEach
    void setUp() {
        // Mock application properties
        applicationProperties = mock(ApplicationProperties.class);
        Ui ui = mock(Ui.class);
        when(applicationProperties.getUi()).thenReturn(ui);

        // Create language service with test implementation
        languageService = new LanguageServiceForTest(applicationProperties);
    }

    @Test
    void testGetSupportedLanguages_BasicFunctionality() throws IOException {
        // Set up mocked resources
        Resource enResource = createMockResource("messages_en_US.properties");
        Resource frResource = createMockResource("messages_fr_FR.properties");
        Resource[] mockResources = new Resource[] {enResource, frResource};

        // Configure the test service
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        // Execute the method
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Basic assertions
        assertTrue(supportedLanguages.contains("en_US"), "en_US should be included");
        assertTrue(supportedLanguages.contains("fr_FR"), "fr_FR should be included");
    }

    @Test
    void testGetSupportedLanguages_FilteringInvalidFiles() throws IOException {
        // Set up mocked resources with invalid files
        Resource[] mockResources =
                new Resource[] {
                    createMockResource("messages_en_US.properties"), // Valid
                    createMockResource("invalid_file.properties"), // Invalid
                    createMockResource(null) // Null filename
                };

        // Configure the test service
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        // Execute the method
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify filtering
        assertTrue(supportedLanguages.contains("en_US"), "Valid language should be included");
        assertFalse(
                supportedLanguages.contains("invalid_file"),
                "Invalid filename should be filtered out");
    }

    @Test
    void testGetSupportedLanguages_WithRestrictions() throws IOException {
        // Set up test resources
        Resource[] mockResources =
                new Resource[] {
                    createMockResource("messages_en_US.properties"),
                    createMockResource("messages_fr_FR.properties"),
                    createMockResource("messages_de_DE.properties"),
                    createMockResource("messages_en_GB.properties")
                };

        // Configure the test service
        ((LanguageServiceForTest) languageService).setMockResources(mockResources);

        // Allow only specific languages (en_GB is always included)
        when(applicationProperties.getUi().getLanguages())
                .thenReturn(Arrays.asList("en_US", "fr_FR"));

        // Execute the method
        Set<String> supportedLanguages = languageService.getSupportedLanguages();

        // Verify filtering by restrictions
        assertTrue(supportedLanguages.contains("en_US"), "Allowed language should be included");
        assertTrue(supportedLanguages.contains("fr_FR"), "Allowed language should be included");
        assertTrue(supportedLanguages.contains("en_GB"), "en_GB should always be included");
        assertFalse(supportedLanguages.contains("de_DE"), "Restricted language should be excluded");
    }

    // Helper methods
    private Resource createMockResource(String filename) {
        Resource mockResource = mock(Resource.class);
        when(mockResource.getFilename()).thenReturn(filename);
        return mockResource;
    }

    // Test subclass
    private static class LanguageServiceForTest extends LanguageService {
        private Resource[] mockResources;

        public LanguageServiceForTest(ApplicationProperties applicationProperties) {
            super(applicationProperties);
        }

        public void setMockResources(Resource[] mockResources) {
            this.mockResources = mockResources;
        }

        @Override
        protected Resource[] getResourcesFromPattern(String pattern) throws IOException {
            return mockResources;
        }
    }
}
