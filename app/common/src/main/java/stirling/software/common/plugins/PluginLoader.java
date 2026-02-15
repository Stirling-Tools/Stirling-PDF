package stirling.software.common.plugins;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;

/**
 * Utility responsible for discovering plugin jars, parsing their metadata, and integrating them
 * into the Stirling-PDF runtime.
 */
@Slf4j
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class PluginLoader {
    private static final String METADATA_RESOURCE = "META-INF/stirling-plugin.json";
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static List<Path> listPluginJars() {
        Path pluginDir = ensurePluginDirectory();
        if (!Files.isDirectory(pluginDir)) {
            return Collections.emptyList();
        }
        try (Stream<Path> stream = Files.list(pluginDir)) {
            return stream.filter(Files::isRegularFile)
                    .filter(path -> path.toString().toLowerCase().endsWith(".jar"))
                    .filter(
                            path -> {
                                try {
                                    String mimeType = Files.probeContentType(path);
                                    return mimeType != null
                                            && mimeType.equals("application/java-archive");
                                } catch (IOException e) {
                                    log.warn(
                                            "Failed to probe content type of {}: {}",
                                            path,
                                            e.getMessage());
                                    return false;
                                }
                            })
                    .sorted(Comparator.comparing(Path::getFileName))
                    .collect(Collectors.toList());
        } catch (IOException e) {
            log.warn("Failed to list plugin directory {}: {}", pluginDir, e.getMessage());
            return Collections.emptyList();
        }
    }

    public static List<URL> pluginJarUrls() {
        List<Path> jars = listPluginJars();
        if (jars.isEmpty()) {
            return Collections.emptyList();
        }
        List<URL> urls = new ArrayList<>(jars.size());
        for (Path jar : jars) {
            try {
                urls.add(jar.toUri().toURL());
            } catch (MalformedURLException e) {
                log.warn("Skipping plugin jar with invalid URL {}: {}", jar, e.getMessage());
            }
        }
        return urls;
    }

    public static ClassLoader buildPluginClassLoader(ClassLoader parent) {
        List<URL> urls = pluginJarUrls();
        if (urls.isEmpty()) {
            return parent;
        }
        log.info(
                "Scanning {} plugin jars in {}",
                urls.size(),
                InstallationPathConfig.getPluginsPath());
        return new URLClassLoader(urls.toArray(URL[]::new), parent);
    }

    public static List<PluginDescriptor> loadDescriptors() {
        List<Path> jars = listPluginJars();
        if (jars.isEmpty()) {
            return Collections.emptyList();
        }
        List<PluginDescriptor> descriptors = new ArrayList<>();
        for (Path jar : jars) {
            PluginDescriptor descriptor = readDescriptorFromJar(jar);
            if (descriptor != null) {
                descriptors.add(descriptor);
            }
        }
        return Collections.unmodifiableList(descriptors);
    }

    public static PluginDescriptor loadDescriptor(Path jarPath) {
        return readDescriptorFromJar(jarPath);
    }

    private static Path ensurePluginDirectory() {
        Path pluginDir = Path.of(InstallationPathConfig.getPluginsPath());
        try {
            return Files.createDirectories(pluginDir);
        } catch (IOException e) {
            log.error("Unable to create plugin directory {}", pluginDir, e);
            return pluginDir;
        }
    }

    private static PluginDescriptor readDescriptorFromJar(Path jarPath) {
        try (JarFile jarFile = new JarFile(jarPath.toFile())) {
            JarEntry entry = jarFile.getJarEntry(METADATA_RESOURCE);
            if (entry == null) {
                log.info("Plugin jar {} does not include {}, skipping", jarPath, METADATA_RESOURCE);
                return null;
            }
            PluginMetadata metadata;
            try (InputStream inputStream = jarFile.getInputStream(entry)) {
                metadata = OBJECT_MAPPER.readValue(inputStream, PluginMetadata.class);
            }

            BasicFileAttributes attrs = Files.readAttributes(jarPath, BasicFileAttributes.class);
            String createdAt = attrs.creationTime().toInstant().toString();

            if (metadata.getId() == null || metadata.getId().isBlank()) {
                log.warn("Plugin metadata in {} is missing required id, ignoring", jarPath);
                return null;
            }

            String pluginId = metadata.getId();
            log.info(
                    "Loaded metadata for plugin '{}': name='{}' version='{}'",
                    pluginId,
                    metadata.getName(),
                    metadata.getVersion());

            return buildDescriptor(metadata, createdAt);
        } catch (IOException e) {
            log.warn("Failed to inspect plugin jar {}: {}", jarPath, e.getMessage());
            return null;
        }
    }

    private static PluginDescriptor buildDescriptor(PluginMetadata metadata, String jarCreatedAt) {
        PluginMetadata.PluginFrontend frontend = metadata.getFrontend();
        String id = metadata.getId();
        String icon = metadata.getIcon();

        String frontendPath =
                (frontend != null
                                && frontend.getEntrypoint() != null
                                && !frontend.getEntrypoint().isBlank())
                        ? ensureLeadingSlash(frontend.getEntrypoint())
                        : "/plugins/" + id + "/index.html";

        return PluginDescriptor.builder()
                .id(id)
                .icon(defaultIfEmpty(icon, null))
                .name(defaultIfEmpty(metadata.getName(), id))
                .description(defaultIfEmpty(metadata.getDescription(), ""))
                .version(defaultIfEmpty(metadata.getVersion(), "0.0.0"))
                .author(metadata.getAuthor())
                .frontendLabel(frontend != null ? frontend.getLabel() : null)
                .frontendPath(frontendPath)
                .iconPath(frontend != null ? frontend.getIconPath() : null)
                .hasFrontend(frontend != null)
                .backendEndpoints(
                        metadata.getBackendEndpoints() == null
                                ? Collections.emptyList()
                                : metadata.getBackendEndpoints())
                .metadata(
                        metadata.getMetadata() == null
                                ? Collections.emptyMap()
                                : metadata.getMetadata())
                .minHostVersion(defaultIfEmpty(metadata.getMinHostVersion(), null))
                .jarCreatedAt(jarCreatedAt)
                .build();
    }

    private static String defaultIfEmpty(String value, String fallback) {
        return (value == null || value.isBlank()) ? fallback : value;
    }

    private static String ensureLeadingSlash(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }
        return path.startsWith("/") ? path : "/" + path;
    }
}
