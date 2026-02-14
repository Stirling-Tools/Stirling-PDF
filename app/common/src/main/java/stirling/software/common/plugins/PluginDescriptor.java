package stirling.software.common.plugins;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.Builder;
import lombok.Value;

/** Immutable descriptor that represents a loaded plugin. */
@Value
@Builder
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class PluginDescriptor {

    String id;
    String name;
    String description;
    String version;
    String author;
    String frontendLabel;
    String frontendPath;
    String iconPath;
    String minHostVersion;

    @Builder.Default boolean hasFrontend = false;

    @Builder.Default List<String> backendEndpoints = Collections.emptyList();

    @Builder.Default Map<String, String> metadata = Collections.emptyMap();
}
