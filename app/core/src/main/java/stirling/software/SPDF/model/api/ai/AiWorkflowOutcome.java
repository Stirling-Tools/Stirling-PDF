package stirling.software.SPDF.model.api.ai;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum AiWorkflowOutcome {
    ANSWER("answer"),
    NOT_FOUND("not_found"),
    NEED_TEXT("need_text"),
    PLAN("plan"),
    CLARIFICATION_REQUEST("clarification_request"),
    CANNOT_DO("cannot_do"),
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
