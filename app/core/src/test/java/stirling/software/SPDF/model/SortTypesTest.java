package stirling.software.SPDF.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SortTypesTest {

    private static final Set<String> EXPECTED =
            Set.of(
                    "CUSTOM",
                    "REVERSE_ORDER",
                    "DUPLEX_SORT",
                    "BOOKLET_SORT",
                    "SIDE_STITCH_BOOKLET_SORT",
                    "ODD_EVEN_SPLIT",
                    "ODD_EVEN_MERGE",
                    "REMOVE_FIRST",
                    "REMOVE_LAST",
                    "REMOVE_FIRST_AND_LAST",
                    "DUPLICATE");

    @Test
    void contains_exactly_expected_constants() {
        Set<String> actual =
                Arrays.stream(SortTypes.values()).map(Enum::name).collect(Collectors.toSet());

        assertEquals(
                EXPECTED,
                actual,
                () -> "Enum constants mismatch.\nExpected: " + EXPECTED + "\nActual: " + actual);
    }

    @ParameterizedTest
    @EnumSource(SortTypes.class)
    void valueOf_roundtrip(SortTypes type) {
        assertEquals(type, SortTypes.valueOf(type.name()));
    }

    @Test
    void names_are_unique_and_uppercase() {
        String[] names = Arrays.stream(SortTypes.values()).map(Enum::name).toArray(String[]::new);
        assertEquals(names.length, Set.of(names).size(), "Duplicate enum names?");
        for (String n : names) {
            assertEquals(n, n.toUpperCase(), "Enum name not uppercase: " + n);
        }
    }
}
