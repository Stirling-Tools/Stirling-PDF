package stirling.software.SPDF.model.ai;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Metadata about an available AI agent. */
public record AgentInfo(
        @JsonProperty("agentId") String agentId,
        @JsonProperty("name") String name,
        @JsonProperty("description") String description,
        @JsonProperty("category") String category) {}
