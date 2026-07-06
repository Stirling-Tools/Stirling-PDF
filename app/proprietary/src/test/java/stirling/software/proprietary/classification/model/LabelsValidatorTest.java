package stirling.software.proprietary.classification.model;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("LabelsValidator")
class LabelsValidatorTest {

    private static ClassificationLabels labels(ClassificationLabel... labels) {
        return new ClassificationLabels(List.of(labels));
    }

    private static ClassificationLabel label(String name) {
        return new ClassificationLabel(name, null);
    }

    @Test
    @DisplayName("accepts a well-formed label set")
    void acceptsValid() {
        ClassificationLabels set =
                labels(new ClassificationLabel("Invoice", "receipt-long"), label("Contract"));
        assertThatCode(() -> LabelsValidator.validate(set)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("accepts an empty label set (reads as: use the default)")
    void acceptsEmpty() {
        assertThatCode(() -> LabelsValidator.validate(labels())).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("rejects a null label set")
    void rejectsNull() {
        assertThatThrownBy(() -> LabelsValidator.validate(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Labels are required");
    }

    @Test
    @DisplayName("rejects duplicate names")
    void rejectsDuplicateNames() {
        ClassificationLabels set = labels(label("Invoice"), label("Invoice"));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate label name");
    }

    @Test
    @DisplayName("rejects duplicate names differing only by case")
    void rejectsDuplicateNamesCaseInsensitive() {
        ClassificationLabels set = labels(label("Invoice"), label("INVOICE"));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate label name");
    }

    @Test
    @DisplayName("rejects a blank name")
    void rejectsBlankName() {
        ClassificationLabels set = labels(label(" "));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be blank");
    }

    @Test
    @DisplayName("rejects an over-long name")
    void rejectsOverLongName() {
        ClassificationLabels set = labels(label("x".repeat(LabelsValidator.MAX_TEXT_LENGTH + 1)));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too long");
    }

    @Test
    @DisplayName("rejects an over-long icon (a null icon is fine)")
    void rejectsOverLongIcon() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel(
                                "Invoice", "x".repeat(LabelsValidator.MAX_TEXT_LENGTH + 1)));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("icon is too long");
    }

    @Test
    @DisplayName("rejects more labels than the cap")
    void rejectsTooManyLabels() {
        List<ClassificationLabel> tooMany =
                IntStream.rangeClosed(0, LabelsValidator.MAX_LABELS)
                        .mapToObj(i -> label("label" + i))
                        .toList();
        assertThatThrownBy(() -> LabelsValidator.validate(new ClassificationLabels(tooMany)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Too many labels");
    }
}
