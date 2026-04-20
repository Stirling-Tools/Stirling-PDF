package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Progress phases emitted during AI workflow orchestration. */
public enum AiWorkflowPhase {
    ANALYZING("analyzing"),
    CALLING_ENGINE("calling_engine"),
    EXTRACTING_CONTENT("extracting_content"),
    EXECUTING_TOOL("executing_tool"),
    PROCESSING("processing");

    private final String value;

    AiWorkflowPhase(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static AiWorkflowPhase fromValue(String value) {
        for (AiWorkflowPhase phase : values()) {
            if (phase.value.equals(value)) {
                return phase;
            }
        }
        throw new IllegalArgumentException("Unknown AI workflow phase: " + value);
    }
}
