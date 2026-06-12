package stirling.software.common.configuration;

import java.util.Properties;

// TODO: Migration required - this class implements the Spring SPI
// org.springframework.core.io.support.PropertySourceFactory, which is used together with
// Spring's @PropertySource(factory = YamlPropertySourceFactory.class) to load YAML into the
// Spring Environment. Quarkus/MicroProfile Config (SmallRye) has no PropertySourceFactory,
// PropertySource, PropertiesPropertySource, EncodedResource, or YamlPropertiesFactoryBean
// equivalent; YAML is handled natively via application.yaml + ConfigSource. There is no
// faithful drop-in conversion, so the original Spring logic is intentionally left intact.
// Replacement path: implement an org.eclipse.microprofile.config.spi.ConfigSource (or use
// io.smallrye.config.source.yaml.YamlConfigSource) and register it, then delete this class
// and its @PropertySource usages. The Spring imports below cannot be removed without breaking
// the SPI contract this class implements.
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

        return new PropertiesPropertySource(
                encodedResource.getResource().getFilename(), properties);
    }
}
