package stirling.software.proprietary.classification;

import stirling.software.proprietary.document.conditions.Condition;
import stirling.software.proprietary.document.conditions.ConditionInput;

/** Identifies conditions that consume a classifier-produced verdict. */
public final class ClassificationConditions {

    private ClassificationConditions() {}

    /**
     * Missing or unrelated inputs do not require classification; validation handles invalid ones.
     */
    public static boolean requiresClassification(Condition condition) {
        return condition != null
                && condition.input() instanceof ConditionInput.DocumentField(var field)
                && field != null
                && field.startsWith("classification.");
    }
}
