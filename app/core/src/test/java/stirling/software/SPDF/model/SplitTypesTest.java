package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SplitTypesTest {

    @Nested
    @DisplayName("enum constants")
    class Constants {

        @Test
        @DisplayName("contains exactly the expected constants")
        void containsExpected() {
            assertThat(Arrays.stream(SplitTypes.values()).map(Enum::name))
                    .containsExactlyInAnyOrder(
                            "CUSTOM",
                            "SPLIT_ALL_EXCEPT_FIRST_AND_LAST",
                            "SPLIT_ALL_EXCEPT_FIRST",
                            "SPLIT_ALL_EXCEPT_LAST",
                            "SPLIT_ALL");
        }

        @Test
        @DisplayName("has five constants")
        void hasFive() {
            assertThat(SplitTypes.values()).hasSize(5);
        }
    }

    @Nested
    @DisplayName("valueOf")
    class ValueOf {

        @ParameterizedTest
        @EnumSource(SplitTypes.class)
        @DisplayName("round trips name to constant")
        void roundTrip(SplitTypes type) {
            assertThat(SplitTypes.valueOf(type.name())).isSameAs(type);
        }

        @Test
        @DisplayName("throws for unknown name")
        void unknownThrows() {
            assertThatThrownBy(() -> SplitTypes.valueOf("NOT_A_TYPE"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    @DisplayName("ordinal ordering is stable")
    void ordinalOrdering() {
        assertThat(SplitTypes.CUSTOM.ordinal()).isZero();
        assertThat(SplitTypes.SPLIT_ALL.ordinal()).isEqualTo(4);
    }
}
