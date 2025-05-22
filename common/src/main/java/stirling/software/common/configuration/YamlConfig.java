package stirling.software.common.configuration;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.EncodedResource;

@Slf4j
@Configuration
public class YamlConfig {

    @Bean
    public PropertySource<?> dynamicYamlPropertySource(ConfigurableEnvironment environment)
        throws IOException {
        String configPath = InstallationPathConfig.getSettingsPath();
        log.debug("Attempting to load settings from: " + configPath);

        File file = new File(configPath);
        if (!file.exists()) {
            log.error("Warning: Settings file does not exist at: " + configPath);
        }

        Resource resource = new FileSystemResource(configPath);
        if (!resource.exists()) {
            throw new FileNotFoundException("Settings file not found at: " + configPath);
        }

        EncodedResource encodedResource = new EncodedResource(resource);
        PropertySource<?> propertySource =
            new YamlPropertySourceFactory().createPropertySource(null, encodedResource);
        environment.getPropertySources().addFirst(propertySource);

        log.debug("Loaded properties: " + propertySource.getSource());

        return propertySource;
    }
}
