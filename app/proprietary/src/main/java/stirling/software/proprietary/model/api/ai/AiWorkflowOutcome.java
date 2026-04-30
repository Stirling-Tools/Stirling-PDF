package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Discriminator values for AI workflow responses.
 *
 * <p>Values MUST match {@code WorkflowOutcome} in {@code engine/src/stirling/contracts/common.py}.
 */
public enum AiWorkflowOutcome {
    ANSWER("answer"),
    NOT_FOUND("not_found"),
    NEED_CONTENT("need_content"),
    PLAN("plan"),
    NEED_CLARIFICATION("need_clarification"),
    CANNOT_DO("cannot_do"),
    DRAFT("draft"),
    TOOL_CALL("tool_call"),
    COMPLETED("completed"),
    UNSUPPORTED_CAPABILITY("unsupported_capability"),
    CANNOT_CONTINUE("cannot_continue");

    private final String value;

    AiWorkflowOutcome(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static AiWorkflowOutcome fromValue(String value) {
        for (AiWorkflowOutcome outcome : values()) {
            if (outcome.value.equals(value)) {
                return outcome;
            }
        }
        throw new IllegalArgumentException("Unknown AI workflow outcome: " + value);
    }
}
