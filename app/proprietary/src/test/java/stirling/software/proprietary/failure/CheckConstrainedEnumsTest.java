package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the five enums {@code file_run_events} stores behind CHECK constraints: adding a value is a
 * schema change dressed as a Java one, compiling here and failing against a real database.
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
        // Resolved per reader, so a column would hold the wrong answer for all but one person.
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
        // A plain varchar with no CHECK, which is what lets a new kind ship without a migration.
        assertThat(FileRunEventEntity.class.getDeclaredField("kindId").getType())
                .isEqualTo(String.class);
    }

    private static List<String> names(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).toList();
    }
}
