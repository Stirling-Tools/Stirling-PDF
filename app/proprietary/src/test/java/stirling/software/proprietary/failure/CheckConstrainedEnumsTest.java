package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the five enums that {@code file_run_events} stores as strings behind CHECK constraints. The
 * shipped migration spells out the permitted values, so adding one to {@code status}, {@code
 * origin}, {@code stage}, {@code severity} or {@code scope} is a schema change dressed up as a Java
 * change: it compiles, then fails against a real database on the row that most needed recording.
 * Reordering is free, since values are persisted by name.
 */
class CheckConstrainedEnumsTest {

    @Test
    @DisplayName("no value has been added to a CHECK-constrained column's enum")
    void everyPersistedEnumStillMatchesTheShippedCheckConstraints() {
        assertThat(names(FileRunEventStatus.values()))
                .containsExactlyInAnyOrder(
                        "NEW", "ACKNOWLEDGED", "DISMISSED", "RESOLVED", "FILE_REMOVED");
        assertThat(names(FailureOrigin.values()))
                .containsExactlyInAnyOrder("TOOL", "POLICY", "PIPELINE");
        assertThat(names(FailureStage.values()))
                .containsExactlyInAnyOrder("INPUT", "INTERNAL", "OUTPUT", "BLOCKED", "NEVER_RAN");
        assertThat(names(FailureSeverity.values()))
                .containsExactlyInAnyOrder("ERROR", "WARNING", "INFO");
        assertThat(names(FailureScope.values()))
                .containsExactlyInAnyOrder("FILE", "RUN", "POLICY", "SOURCE", "SERVER");
    }

    @Test
    @DisplayName("the facets added since are derived, not stored")
    void nothingAddedToTheModelReachedTheTable() throws Exception {
        // Audience, slot, execution and ownership are resolved per reader, so a column for any of
        // them would hold the wrong answer for everybody but one person.
        List<Class<?>> persisted =
                Arrays.stream(FileRunEventEntity.class.getDeclaredFields())
                        .filter(field -> !field.isSynthetic())
                        .map(java.lang.reflect.Field::getType)
                        .toList();

        assertThat(persisted)
                .doesNotContain(
                        FailureAudience.class,
                        FailureActionId.class,
                        FailureActionId.Execution.class,
                        Ownership.class);
        // kind_id stays a plain varchar with no CHECK, which is what lets a new kind ship without a
        // migration while the five columns above cannot.
        assertThat(FileRunEventEntity.class.getDeclaredField("kindId").getType())
                .isEqualTo(String.class);
    }

    private static List<String> names(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).toList();
    }
}
