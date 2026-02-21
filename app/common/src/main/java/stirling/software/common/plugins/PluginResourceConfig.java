package stirling.software.common.plugins;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
/** Registers MVC resource handlers that expose static assets from plugin jars. */
public class PluginResourceConfig implements WebMvcConfigurer {

    /** Adds {@code /plugins/**} static resource mappings for every discovered plugin jar. */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        List<String> locations =
                PluginLoader.pluginJarUrls().stream()
                        .map(url -> "jar:" + url + "!/META-INF/resources/plugins/")
                        .collect(Collectors.toList());

        if (!locations.isEmpty()) {
            registry.addResourceHandler("/plugins/**")
                    .addResourceLocations(locations.toArray(String[]::new))
                    .setCachePeriod(0);
        }
    }
}
