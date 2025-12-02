package stirling.software.common.configuration;

import static org.junit.jupiter.api.Assertions.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.ResourceLoader;
import org.thymeleaf.templateresource.FileTemplateResource;
import org.thymeleaf.templateresource.ITemplateResource;

import stirling.software.common.model.InputStreamTemplateResource;

class FileFallbackTemplateResolverTest {

    private ResourceLoader resourceLoader;
    private FileFallbackTemplateResolver resolver;

    @BeforeEach
    void setUp() {
        resourceLoader = new DefaultResourceLoader();
        resolver = new FileFallbackTemplateResolver(resourceLoader);
    }

    @Test
    void computeTemplateResource_returnsFileTemplateResource_whenExternalFileExists()
            throws IOException {
        Path templatesDir = Paths.get(InstallationPathConfig.getTemplatesPath());
        Files.createDirectories(templatesDir);

        String templateName = "external-template.html";
        Path templateFile = templatesDir.resolve(templateName);
        Files.writeString(templateFile, "<html>External Template</html>", StandardCharsets.UTF_8);

        try {
            ITemplateResource resource =
                    resolver.computeTemplateResource(
                            null, null, null, templateName, "UTF-8", Map.of());

            assertNotNull(resource);
            assertInstanceOf(FileTemplateResource.class, resource);
            assertTrue(resource.exists());
            assertTemplateContent(resource, "<html>External Template</html>");
        } finally {
            Files.deleteIfExists(templateFile);
        }
    }

    @Test
    void computeTemplateResource_returnsInputStreamTemplateResource_whenClasspathTemplateExists()
            throws IOException {
        String templateName = "resolver-fallback.html";
        Path templatesDir = Paths.get(InstallationPathConfig.getTemplatesPath());
        Files.deleteIfExists(templatesDir.resolve(templateName));

        ITemplateResource resource =
                resolver.computeTemplateResource(null, null, null, templateName, "UTF-8", Map.of());

        assertNotNull(resource);
        assertInstanceOf(InputStreamTemplateResource.class, resource);
        assertTrue(resource.exists());
        assertTemplateContent(resource, "<html>Fallback Template</html>");
    }

    @Test
    void computeTemplateResource_returnsNull_whenTemplateNotFound() {
        String templateName = "missing-template-" + System.nanoTime() + ".html";

        ITemplateResource resource =
                resolver.computeTemplateResource(null, null, null, templateName, "UTF-8", Map.of());

        assertNull(resource);
    }

    private void assertTemplateContent(ITemplateResource resource, String expectedContent)
            throws IOException {
        try (Reader reader = resource.reader();
                BufferedReader bufferedReader = new BufferedReader(reader)) {
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = bufferedReader.readLine()) != null) {
                content.append(line);
            }
            assertEquals(expectedContent, content.toString());
        }
    }
}
