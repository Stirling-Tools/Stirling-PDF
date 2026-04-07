package stirling.software.SPDF.model.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request to start an AI agent chat session. */
public record ChatRequest(
        @JsonProperty("message") @NotBlank @Size(max = 10_000) String message,
        @JsonProperty("conversationId") @Size(max = 200) String conversationId,
        @JsonProperty("fileNames") @Size(max = 50) List<String> fileNames,
        @JsonProperty("extractedText") @Size(max = 500_000) String extractedText,
        @JsonProperty("agentId") @Size(max = 50) String agentId) {}
