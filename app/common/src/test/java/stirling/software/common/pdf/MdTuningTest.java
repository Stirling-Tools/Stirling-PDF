package stirling.software.common.pdf;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MdTuningTest {

    private static final String KEY = "stirling.md.testOnlyKnob";

    @AfterEach
    void clearProperty() {
        System.clearProperty(KEY);
    }

    @Test
    void malformedValuesFallBackInsteadOfBreakingClassInit() {
        // These reads run in static initialisers, where a throw would be an
        // ExceptionInInitializerError and the converter would stay unloadable for the JVM's life.
        System.setProperty(KEY, "not-a-number");
        assertEquals(0.5f, MdTuning.num(KEY, 0.5f));
        assertEquals(7, MdTuning.count(KEY, 7));

        System.setProperty(KEY, "");
        assertEquals(0.5f, MdTuning.num(KEY, 0.5f));
        assertEquals(7, MdTuning.count(KEY, 7));
    }

    @Test
    void wellFormedValuesStillOverrideTheDefault() {
        System.setProperty(KEY, " 0.25 ");
        assertEquals(0.25f, MdTuning.num(KEY, 0.5f));

        System.setProperty(KEY, "12");
        assertEquals(12, MdTuning.count(KEY, 7));

        System.setProperty(KEY, "false");
        assertEquals(false, MdTuning.flag(KEY, true));

        System.setProperty(KEY, "grid");
        assertEquals("grid", MdTuning.text(KEY, "pipe"));
    }

    @Test
    void unsetKeysReadTheirDefault() {
        assertEquals(0.5f, MdTuning.num(KEY, 0.5f));
        assertEquals(7, MdTuning.count(KEY, 7));
        assertTrue(MdTuning.flag(KEY, true));
        assertEquals("pipe", MdTuning.text(KEY, "pipe"));
    }
}
