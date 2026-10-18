package stirling.software.saas.config;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.config.ConfigDataEnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;

/**
 * The generated settings.yml is an additional config location, so it outranks the packaged
 * application-saas.properties. Lifts only its mcp.* pins above config files; env vars still win.
 */
public class SaasMcpPinsPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String SOURCE_NAME = "saasMcpPins";
    private static final String SAAS_PROPERTIES = "application-saas.properties";

    @Override
    public int getOrder() {
        return ConfigDataEnvironmentPostProcessor.ORDER + 1;
    }

    @Override
    public void postProcessEnvironment(
            ConfigurableEnvironment environment, SpringApplication application) {
        if (!environment.matchesProfiles("saas")) {
            return;
        }
        MutablePropertySources sources = environment.getPropertySources();
        Map<String, Object> pins = new LinkedHashMap<>();
        for (PropertySource<?> source : sources) {
            if (source.getName().contains(SAAS_PROPERTIES)
                    && source instanceof EnumerablePropertySource<?> props) {
                for (String name : props.getPropertyNames()) {
                    if (name.startsWith("mcp.") && !pins.containsKey(name)) {
                        Object value = props.getProperty(name);
                        pins.put(name, environment.resolvePlaceholders(String.valueOf(value)));
                    }
                }
            }
        }
        if (pins.isEmpty()) {
            return;
        }
        MapPropertySource pinned = new MapPropertySource(SOURCE_NAME, pins);
        if (sources.contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME)) {
            sources.addAfter(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, pinned);
        } else {
            sources.addFirst(pinned);
        }
    }
}
