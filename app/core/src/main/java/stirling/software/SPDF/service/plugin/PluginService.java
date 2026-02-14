package stirling.software.SPDF.service.plugin;

import java.nio.file.Path;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import stirling.software.common.plugins.PluginDescriptor;
import stirling.software.common.plugins.PluginLoader;

@Service
public class PluginService {
    private final List<PluginDescriptor> plugins;
    private final Map<String, Path> pluginJarPaths;

    public PluginService() {
        List<Path> jars = PluginLoader.listPluginJars();
        Map<String, Path> jarMap = new LinkedHashMap<>();
        List<PluginDescriptor> descriptors = new java.util.ArrayList<>();

        for (Path jar : jars) {
            PluginDescriptor descriptor = PluginLoader.loadDescriptor(jar);
            if (descriptor != null) {
                descriptors.add(descriptor);
                jarMap.put(descriptor.getId(), jar);
            }
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
