package stirling.software.SPDF.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.thymeleaf.IEngineConfiguration;
import org.thymeleaf.templateresolver.AbstractConfigurableTemplateResolver;
import org.thymeleaf.templateresource.FileTemplateResource;
import org.thymeleaf.templateresource.ITemplateResource;

import stirling.software.SPDF.model.InputStreamTemplateResource;

public class FileFallbackTemplateResolver extends AbstractConfigurableTemplateResolver {

    private final ResourceLoader resourceLoader;

    public FileFallbackTemplateResolver(ResourceLoader resourceLoader) {
        super();
        this.resourceLoader = resourceLoader;
        setSuffix(".html");
    }

    // Note this does not work in local IDE, Prod jar only.
    @Override
    protected ITemplateResource computeTemplateResource(
            IEngineConfiguration configuration,
            String ownerTemplate,
            String template,
            String resourceName,
            String characterEncoding,
            Map<String, Object> templateResolutionAttributes) {
        Resource resource =
                resourceLoader.getResource("file:./customFiles/templates/" + resourceName);
        try {
            if (resource.exists() && resource.isReadable()) {
                return new FileTemplateResource(resource.getFile().getPath(), characterEncoding);
            }
        } catch (IOException e) {

        }

        InputStream inputStream =
                Thread.currentThread()
                        .getContextClassLoader()
                        .getResourceAsStream("templates/" + resourceName);
        if (inputStream != null) {
            return new InputStreamTemplateResource(inputStream, "UTF-8");
        }
        return null;
    }
}
