package stirling.software.common.plugins;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)
/** Model for deserializing {@code META-INF/stirling-plugin.json} from a plugin jar. */
public class PluginMetadata {
    private String id;
    private String icon;
    private String name;
    private String description;
    private String version;
    private String author;
    private String minHostVersion;
    private PluginFrontend frontend;
    private List<String> backendEndpoints;
    private Map<String, String> metadata;

    /** Frontend-specific metadata block declared inside plugin metadata JSON. */
    @Getter
    @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PluginFrontend {
        private String entrypoint;
        private String label;
        private String iconPath;
    }
}
