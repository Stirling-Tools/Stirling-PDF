package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class BoundedProcessOutputTest {
    @Test
    void ordinaryOutputIsPreservedExactly() {
        var output = new BoundedProcessOutput();
        output.add("hello");
        output.add("world");
        assertThat(output.toString()).isEqualTo("hello\nworld");
    }

    @Test
    void noisyProcessKeepsTheInitialContextAndFinalErrorWithinTheBudget() {
        var output = new BoundedProcessOutput();
        output.add("starting conversion");
        String noise = "x".repeat(4096);
        for (int i = 0; i < 65_536; i++) output.add(noise);
        output.add("last diagnostic");
        String retained = output.toString();
        assertThat(retained).startsWith("starting conversion\n").endsWith("last diagnostic");
        assertThat(retained).contains("process output truncated");
        assertThat(retained.length()).isLessThan(BoundedProcessOutput.LIMIT + 100);
    }

    @Test
    void oversizedSingleLineRetainsBothEnds() {
        var output = new BoundedProcessOutput();
        output.add("first" + "x".repeat(BoundedProcessOutput.LIMIT * 3) + "last");
        assertThat(output.toString()).startsWith("first").endsWith("last");
        assertThat(output.toString().length()).isLessThan(BoundedProcessOutput.LIMIT + 100);
    }
}
