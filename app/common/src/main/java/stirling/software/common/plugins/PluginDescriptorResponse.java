package stirling.software.common.plugins;

import java.util.List;
import java.util.Map;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
/**
 * API-facing representation of a plugin descriptor with a fully resolved frontend URL.
 *
 * <p>This DTO is returned to clients so they can render plugin metadata and open plugin UIs.
 */
public class PluginDescriptorResponse {
    String id;
    String icon;
    String name;
    String description;
    String version;
    String author;
    String frontendUrl;
    String frontendLabel;
    String iconPath;
    String minHostVersion;
    String jarCreatedAt;
    boolean hasFrontend;
    List<String> backendEndpoints;
    Map<String, String> metadata;

    /**
     * Creates a response object from an internal {@link PluginDescriptor}.
     *
     * @param descriptor loaded plugin descriptor
     * @param baseUrl optional API base URL used to build an absolute frontend URL
     * @return normalized response payload for API clients
     */
    public static PluginDescriptorResponse from(PluginDescriptor descriptor, String baseUrl) {
        String frontendPath = descriptor.getFrontendPath();
        String normalizedBase = baseUrl != null ? baseUrl.replaceAll("/+$", "") : "";
        String normalizedPath = frontendPath != null ? frontendPath.replaceAll("^/+", "/") : "";
        String frontendUrl =
                (normalizedBase.isEmpty() || normalizedPath.isEmpty())
                        ? (normalizedPath.isEmpty() ? null : normalizedPath)
                        : normalizedBase + normalizedPath;

        return PluginDescriptorResponse.builder()
                .id(descriptor.getId())
                .icon(descriptor.getIcon())
                .name(descriptor.getName())
                .description(descriptor.getDescription())
                .version(descriptor.getVersion())
                .author(descriptor.getAuthor())
                .frontendUrl(frontendUrl)
                .frontendLabel(descriptor.getFrontendLabel())
                .iconPath(descriptor.getIconPath())
                .hasFrontend(descriptor.isHasFrontend())
                .backendEndpoints(descriptor.getBackendEndpoints())
                .metadata(descriptor.getMetadata())
                .minHostVersion(descriptor.getMinHostVersion())
                .jarCreatedAt(descriptor.getJarCreatedAt())
                .build();
    }
}
