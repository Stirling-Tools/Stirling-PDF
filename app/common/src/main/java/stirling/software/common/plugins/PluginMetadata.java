package stirling.software.common.plugins;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@JsonIgnoreProperties(ignoreUnknown = true)
public class PluginMetadata {
    private String id;
    private String name;
    private String description;
    private String version;
    private String author;
    private String minHostVersion;
    private PluginFrontend frontend;
    private List<String> backendEndpoints;
    private Map<String, String> metadata;

    @Getter
    @Setter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PluginFrontend {
        private String entrypoint;
        private String label;
        private String iconPath;
    }
}
