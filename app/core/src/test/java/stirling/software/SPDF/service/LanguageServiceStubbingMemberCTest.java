package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;

class LanguageServiceStubbingMemberCTest {

    private final ApplicationProperties applicationProperties =
            mock(ApplicationProperties.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);

    @Test
    void getSupportedLanguages_usesStubbedResourcesInsteadOfRealClasspathScan() throws Exception {
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        Resource r1 = TestResources.mockResource("messages_en_US.properties");
        Resource r2 = TestResources.mockResource("messages_fr_FR.properties");
        Resource r3 = TestResources.mockResource("not_a_messages_file.properties");
        Resource r4 = TestResources.mockResource("messages_en_GB.properties");

        LanguageService stub =
                new LanguageServiceStub(
                        applicationProperties, new Resource[] {r1, r2, r3, r4}, false);

        Set<String> supported = stub.getSupportedLanguages();

        assertTrue(supported.contains("en_US"));
        assertTrue(supported.contains("fr_FR"));
        assertTrue(supported.contains("en_GB"));
        assertFalse(supported.contains("not_a_messages_file"));
    }

    @Test
    void getSupportedLanguages_whenStubThrowsIOException_returnsEmptySet() throws Exception {
        when(applicationProperties.getUi().getLanguages()).thenReturn(Collections.emptyList());

        LanguageService stub = new LanguageServiceStub(applicationProperties, null, true);

        Set<String> supported = stub.getSupportedLanguages();

        assertTrue(supported.isEmpty());
    }

    private static class LanguageServiceStub extends LanguageService {
        private final Resource[] resources;
        private final boolean throwIOException;

        LanguageServiceStub(
                ApplicationProperties applicationProperties,
                Resource[] resources,
                boolean throwIOException) {
            super(applicationProperties);
            this.resources = resources;
            this.throwIOException = throwIOException;
        }

        @Override
        protected Resource[] getResourcesFromPattern(String pattern) throws IOException {
            if (throwIOException) {
                throw new IOException("Stubbed exception");
            }
            return resources;
        }
    }

    private static class TestResources {
        static Resource mockResource(String filename) {
            Resource r = org.mockito.Mockito.mock(Resource.class);
            org.mockito.Mockito.when(r.getFilename()).thenReturn(filename);
            return r;
        }
    }
}
