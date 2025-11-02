package stirling.software.common.configuration;

import java.util.Properties;

import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.core.io.support.PropertySourceFactory;

public class YamlPropertySourceFactory implements PropertySourceFactory {

    @Override
    public PropertySource<?> createPropertySource(String name, EncodedResource encodedResource) {
        YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
        factory.setResources(encodedResource.getResource());
        Properties properties = factory.getObject();

        String filename = encodedResource.getResource().getFilename();
        if (filename == null) {
            filename = "unknown-yaml-source";
        }

        if (properties == null) {
            throw new IllegalStateException(
                    "Failed to load properties from resource: " + filename);
        }

        return new PropertiesPropertySource(filename, properties);
    }
}
