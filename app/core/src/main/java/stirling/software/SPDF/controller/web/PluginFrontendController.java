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
public class PluginFrontendController {
    private final PluginService pluginService;

    public PluginFrontendController(PluginService pluginService) {
        this.pluginService = pluginService;
    }

    @GetMapping("/plugins/{pluginId}")
    public ResponseEntity<Void> redirectToIndex(@PathVariable String pluginId) {
        return ResponseEntity.status(301)
                .location(URI.create("/plugins/" + pluginId + "/index.html"))
                .build();
    }

    @GetMapping("/plugins/{pluginId}/**")
    public ResponseEntity<ByteArrayResource> servePluginAsset(
            HttpServletRequest request, @PathVariable String pluginId) {
        log.info(
                "[PluginFrontend] Request for pluginId={} uri={}",
                pluginId,
                request.getRequestURI());
        try {
            String contextPath = Optional.ofNullable(request.getContextPath()).orElse("");
            String prefix = contextPath + "/plugins/" + pluginId;
            String requestUri = Optional.ofNullable(request.getRequestURI()).orElse("");
            if (!requestUri.startsWith(prefix)) {
                log.warn(
                        "[PluginFrontend] URI {} does not start with expected prefix {}",
                        requestUri,
                        prefix);
                return ResponseEntity.notFound().build();
            }

            String suffix = requestUri.substring(prefix.length());
            if (suffix.isEmpty() || "/".equals(suffix)) {
                suffix = "/index.html";
            }

            if (suffix.contains("..")) {
                log.warn("[PluginFrontend] Blocked path traversal attempt: {}", suffix);
                return ResponseEntity.badRequest().build();
            }

            Optional<Path> jarPath = pluginService.getPluginJarPath(pluginId);
            if (jarPath.isEmpty() || !Files.isRegularFile(jarPath.get())) {
                log.warn(
                        "[PluginFrontend] Plugin jar not found for {} (path empty or invalid)",
                        pluginId);
                return ResponseEntity.notFound().build();
            }

            String resourcePath = "META-INF/resources/plugins/" + pluginId + suffix;
            try (JarFile jarFile = new JarFile(jarPath.get().toFile())) {
                JarEntry entry = jarFile.getJarEntry(resourcePath);
                if (entry == null || entry.isDirectory()) {
                    log.warn(
                            "[PluginFrontend] Resource {} missing inside {}",
                            resourcePath,
                            jarPath.get());
                    return ResponseEntity.notFound().build();
                }

                byte[] content;
                try (InputStream stream = jarFile.getInputStream(entry)) {
                    content = stream.readAllBytes();
                }

                MediaType mediaType =
                        MediaTypeFactory.getMediaType(entry.getName())
                                .orElse(MediaType.APPLICATION_OCTET_STREAM);
                ByteArrayResource resource = new ByteArrayResource(content);

                log.info(
                        "[PluginFrontend] Served {} ({} bytes) as {}",
                        resourcePath,
                        content.length,
                        mediaType);

                return ResponseEntity.ok()
                        .contentType(mediaType)
                        .cacheControl(CacheControl.noStore())
                        .body(resource);
            }
        } catch (IOException e) {
            log.error("[PluginFrontend] Failed to stream plugin asset", e);
            return ResponseEntity.status(500).build();
        }
    }
}
