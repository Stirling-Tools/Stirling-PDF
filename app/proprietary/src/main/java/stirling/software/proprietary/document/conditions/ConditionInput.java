package stirling.software.proprietary.document.conditions;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * Identifies where a comparison reads its value. Source variants keep document properties separate
 * from references requiring execution state, such as a particular tool step's output.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "source")
@JsonSubTypes(@JsonSubTypes.Type(value = ConditionInput.DocumentField.class, name = "document"))
public sealed interface ConditionInput permits ConditionInput.DocumentField {

    /** A dotted path into DocumentFacts, read from the current file at the evaluation point. */
    record DocumentField(String field) implements ConditionInput {}
}
