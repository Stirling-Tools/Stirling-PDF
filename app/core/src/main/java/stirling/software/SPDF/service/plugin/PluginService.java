package stirling.software.SPDF.service.plugin;

import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.plugins.PluginDescriptor;
import stirling.software.common.plugins.PluginLoader;

@Service
@Slf4j
public class PluginService {
    private final List<PluginDescriptor> plugins;
    private final Map<String, Path> pluginJarPaths;

    public PluginService() {
        List<Path> jars = PluginLoader.listPluginJars();
        Map<String, Path> jarMap = new LinkedHashMap<>();
        List<PluginDescriptor> descriptors = new java.util.ArrayList<>();

        for (Path jar : jars) {
            PluginDescriptor descriptor = PluginLoader.loadDescriptor(jar);
            if (descriptor == null) {
                continue;
            }

            String pluginId = descriptor.getId();
            if (jarMap.containsKey(pluginId)) {
                log.warn(
                        "Duplicate plugin id '{}' detected in {}. Keeping first jar at {}",
                        pluginId,
                        jar,
                        jarMap.get(pluginId));
                continue;
            }

            descriptors.add(descriptor);
            jarMap.put(pluginId, jar);
        }

        this.plugins = Collections.unmodifiableList(descriptors);
        this.pluginJarPaths = Collections.unmodifiableMap(jarMap);
    }

    public List<PluginDescriptor> getPlugins() {
        return plugins;
    }

    public Optional<Path> getPluginJarPath(String pluginId) {
        return Optional.ofNullable(pluginJarPaths.get(pluginId));
    }
}
