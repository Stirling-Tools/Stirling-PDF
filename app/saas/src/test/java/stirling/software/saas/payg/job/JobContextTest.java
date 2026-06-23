package stirling.software.saas.payg.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/** Constructor-validation and accessor tests for the {@link JobContext} record. */
class JobContextTest {

    @Test
    @DisplayName("accepts a fully-populated context and exposes its fields")
    void valid() {
        JobContext ctx =
                new JobContext(10L, 20L, JobSource.PIPELINE, ProcessType.AUTOMATION, 99L, 7);

        assertThat(ctx.ownerUserId()).isEqualTo(10L);
        assertThat(ctx.ownerTeamId()).isEqualTo(20L);
        assertThat(ctx.source()).isEqualTo(JobSource.PIPELINE);
        assertThat(ctx.processType()).isEqualTo(ProcessType.AUTOMATION);
        assertThat(ctx.policyId()).isEqualTo(99L);
        assertThat(ctx.stepLimit()).isEqualTo(7);
    }

    @Test
    @DisplayName("allows a null owner team id")
    void nullTeamAllowed() {
        JobContext ctx = new JobContext(10L, null, JobSource.WEB, ProcessType.SINGLE_TOOL, 1L, 1);
        assertThat(ctx.ownerTeamId()).isNull();
    }

    @Test
    @DisplayName("rejects a null owner user id")
    void rejectsNullOwnerUser() {
        assertThatThrownBy(
                        () ->
                                new JobContext(
                                        null, 20L, JobSource.WEB, ProcessType.SINGLE_TOOL, 1L, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ownerUserId");
    }

    @Test
    @DisplayName("rejects a null source")
    void rejectsNullSource() {
        assertThatThrownBy(() -> new JobContext(1L, 20L, null, ProcessType.SINGLE_TOOL, 1L, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("source");
    }

    @Test
    @DisplayName("rejects a null process type")
    void rejectsNullProcessType() {
        assertThatThrownBy(() -> new JobContext(1L, 20L, JobSource.WEB, null, 1L, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("processType");
    }

    @Test
    @DisplayName("rejects a null policy id")
    void rejectsNullPolicy() {
        assertThatThrownBy(
                        () ->
                                new JobContext(
                                        1L, 20L, JobSource.WEB, ProcessType.SINGLE_TOOL, null, 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("policyId");
    }

    @Test
    @DisplayName("rejects a non-positive step limit")
    void rejectsNonPositiveStepLimit() {
        assertThatThrownBy(
                        () ->
                                new JobContext(
                                        1L, 20L, JobSource.WEB, ProcessType.SINGLE_TOOL, 1L, 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("stepLimit");
        assertThatThrownBy(
                        () ->
                                new JobContext(
                                        1L, 20L, JobSource.WEB, ProcessType.SINGLE_TOOL, 1L, -3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("stepLimit");
    }

    @Test
    @DisplayName("equal values produce equal records")
    void valueSemantics() {
        JobContext a = new JobContext(1L, 2L, JobSource.API, ProcessType.CHAIN, 5L, 3);
        JobContext b = new JobContext(1L, 2L, JobSource.API, ProcessType.CHAIN, 5L, 3);
        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }
}
