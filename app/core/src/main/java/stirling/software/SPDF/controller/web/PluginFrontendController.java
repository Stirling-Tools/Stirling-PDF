package stirling.software.SPDF.controller.web;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.plugin.PluginService;

@Controller
@Slf4j
/**
 * Serves static frontend assets embedded in plugin jars under {@code META-INF/resources/plugins}.
 */
public class PluginFrontendController {
    private static final String PLUGIN_RESOURCE_ROOT = "META-INF/resources/plugins/";

    private final PluginService pluginService;

    /**
     * @param pluginService service used to resolve plugin jar locations
     */
    public PluginFrontendController(PluginService pluginService) {
        this.pluginService = pluginService;
    }

    /**
     * Redirects plugin root requests to the conventional {@code index.html} entrypoint.
     *
     * @param pluginId requested plugin identifier
     * @return permanent redirect to plugin index page
     */
    @GetMapping("/plugins/{pluginId}")
    public ResponseEntity<Void> redirectToIndex(@PathVariable String pluginId) {
        return ResponseEntity.status(301)
                .location(URI.create("/plugins/" + pluginId + "/index.html"))
                .build();
    }

    /**
     * Streams an asset from the requested plugin jar, while validating path boundaries to avoid
     * traversal outside the plugin resource root.
     *
     * @param request incoming servlet request used to extract suffix path
     * @param pluginId requested plugin identifier
     * @return asset content when found; suitable HTTP error otherwise
     */
    @GetMapping("/plugins/{pluginId}/**")
    public ResponseEntity<ByteArrayResource> servePluginAsset(
            HttpServletRequest request, @PathVariable String pluginId) {
        try {
            String suffix = resolveSuffix(request, pluginId);
            if (suffix == null) {
                return ResponseEntity.notFound().build();
            }

            if (suffix.contains("..")) {
                log.warn(
                        "[PluginFrontend] Blocked path traversal attempt for {}: {}",
                        pluginId,
                        suffix);
                return ResponseEntity.badRequest().build();
            }

            Optional<Path> jarPath = pluginService.getPluginJarPath(pluginId);
            if (jarPath.isEmpty() || !Files.isRegularFile(jarPath.get())) {
                return ResponseEntity.notFound().build();
            }

            String resourcePath = PLUGIN_RESOURCE_ROOT + pluginId + suffix;
            return serveResourceFromJar(jarPath.get(), resourcePath);
        } catch (IOException e) {
            log.error("[PluginFrontend] Failed to stream plugin asset for {}", pluginId, e);
            return ResponseEntity.status(500).build();
        }
    }

    private static String resolveSuffix(HttpServletRequest request, String pluginId) {
        String contextPath = Optional.ofNullable(request.getContextPath()).orElse("");
        String requestUri = Optional.ofNullable(request.getRequestURI()).orElse("");
        String prefix = contextPath + "/plugins/" + pluginId;
        if (!requestUri.startsWith(prefix)) {
            return null;
        }

        String suffix = requestUri.substring(prefix.length());
        if (suffix.isEmpty() || "/".equals(suffix)) {
            return "/index.html";
        }
        return suffix;
    }

    private static ResponseEntity<ByteArrayResource> serveResourceFromJar(
            Path jarPath, String resourcePath) throws IOException {
        try (JarFile jarFile = new JarFile(jarPath.toFile())) {
            JarEntry entry = jarFile.getJarEntry(resourcePath);
            if (entry == null || entry.isDirectory()) {
                return ResponseEntity.notFound().build();
            }

            byte[] content;
            try (InputStream stream = jarFile.getInputStream(entry)) {
                content = stream.readAllBytes();
            }

            MediaType mediaType =
                    MediaTypeFactory.getMediaType(entry.getName())
                            .orElse(MediaType.APPLICATION_OCTET_STREAM);

            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .cacheControl(CacheControl.noStore())
                    .body(new ByteArrayResource(content));
        }
    }
}
