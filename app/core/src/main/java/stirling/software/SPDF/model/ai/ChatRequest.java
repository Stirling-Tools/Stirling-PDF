package stirling.software.SPDF.model.ai;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

/** Request to start an AI agent chat session. */
public record ChatRequest(
        @JsonProperty("message") String message,
        @JsonProperty("conversationId") String conversationId,
        @JsonProperty("fileNames") List<String> fileNames,
        @JsonProperty("extractedText") String extractedText) {}
