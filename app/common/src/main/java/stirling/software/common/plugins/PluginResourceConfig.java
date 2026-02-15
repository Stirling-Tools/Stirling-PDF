package stirling.software.common.plugins;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class PluginResourceConfig implements WebMvcConfigurer {

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
