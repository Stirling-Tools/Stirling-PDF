package stirling.software.SPDF.model;

import java.util.HashMap;
import java.util.Map;

import lombok.Getter;

import tools.jackson.databind.JsonNode;

public class ApiEndpoint {
    private final String name;
    private Map<String, JsonNode> parameters;
    @Getter private final String description;

    public ApiEndpoint(String name, JsonNode postNode) {
        this.name = name;
        this.parameters = new HashMap<>();
        postNode.path("parameters")
                .forEach(
                        paramNode -> {
                            String paramName = paramNode.path("name").asText("");
                            parameters.put(paramName, paramNode);
                        });
        this.description = postNode.path("description").asText("");
    }

    public boolean areParametersValid(Map<String, Object> providedParams) {
        for (String requiredParam : parameters.keySet()) {
            if (!providedParams.containsKey(requiredParam)) {
                return false;
            }
        }
        return true;
    }

    @Override
    public String toString() {
        return "ApiEndpoint [name=" + name + ", parameters=" + parameters + "]";
    }
}
