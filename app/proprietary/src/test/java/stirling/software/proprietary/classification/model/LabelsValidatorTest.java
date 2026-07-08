package stirling.software.proprietary.classification.model;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Locale;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("LabelsValidator")
class LabelsValidatorTest {

    private static ClassificationLabels labels(ClassificationLabel... labels) {
        return new ClassificationLabels(List.of(labels));
    }

    private static ClassificationLabel label(String name) {
        return new ClassificationLabel(slug(name), name, null);
    }

    private static String slug(String name) {
        return name.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
    }

    @Test
    @DisplayName("accepts a well-formed label set")
    void acceptsValid() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel("invoice", "Invoice", "receipt-long"),
                        label("Contract"));
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
    @DisplayName("rejects duplicate names (distinct ids)")
    void rejectsDuplicateNames() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel("invoice-a", "Invoice", null),
                        new ClassificationLabel("invoice-b", "Invoice", null));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate label name");
    }

    @Test
    @DisplayName("rejects duplicate names differing only by case")
    void rejectsDuplicateNamesCaseInsensitive() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel("invoice-a", "Invoice", null),
                        new ClassificationLabel("invoice-b", "INVOICE", null));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate label name");
    }

    @Test
    @DisplayName("rejects duplicate ids")
    void rejectsDuplicateIds() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel("invoice", "Invoice", null),
                        new ClassificationLabel("invoice", "Sales invoice", null));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate label id");
    }

    @Test
    @DisplayName("rejects a blank name")
    void rejectsBlankName() {
        ClassificationLabels set = labels(new ClassificationLabel("blank", " ", null));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label name must not be blank");
    }

    @Test
    @DisplayName("rejects a blank id")
    void rejectsBlankId() {
        ClassificationLabels set = labels(new ClassificationLabel(" ", "Invoice", null));
        assertThatThrownBy(() -> LabelsValidator.validate(set))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label id must not be blank");
    }

    @Test
    @DisplayName("rejects an over-long name")
    void rejectsOverLongName() {
        ClassificationLabels set =
                labels(
                        new ClassificationLabel(
                                "x", "x".repeat(LabelsValidator.MAX_TEXT_LENGTH + 1), null));
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
                                "invoice",
                                "Invoice",
                                "x".repeat(LabelsValidator.MAX_TEXT_LENGTH + 1)));
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
