package stirling.software.saas.payg.charge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.charge.ChargeOutcome.Disposition;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/** Constructor-validation, accessor, and value-semantics tests for the charge-package records. */
class ChargeRecordsTest {

    @Nested
    @DisplayName("ChargeContext")
    class ChargeContextTests {

        @Test
        @DisplayName("accepts a fully-populated context and exposes its fields")
        void validContext() {
            ChargeContext ctx =
                    new ChargeContext(
                            1L, 2L, JobSource.API, ProcessType.SINGLE_TOOL, BillingCategory.API);

            assertThat(ctx.ownerUserId()).isEqualTo(1L);
            assertThat(ctx.ownerTeamId()).isEqualTo(2L);
            assertThat(ctx.source()).isEqualTo(JobSource.API);
            assertThat(ctx.processType()).isEqualTo(ProcessType.SINGLE_TOOL);
            assertThat(ctx.billingCategory()).isEqualTo(BillingCategory.API);
        }

        @Test
        @DisplayName("allows a null team id (anonymous-team callers)")
        void nullTeamIdAllowed() {
            ChargeContext ctx =
                    new ChargeContext(
                            1L, null, JobSource.WEB, ProcessType.CHAIN, BillingCategory.AI);
            assertThat(ctx.ownerTeamId()).isNull();
        }

        @Test
        @DisplayName("rejects missing required fields")
        void rejectsMissingFields() {
            assertThatThrownBy(
                            () ->
                                    new ChargeContext(
                                            null,
                                            2L,
                                            JobSource.API,
                                            ProcessType.SINGLE_TOOL,
                                            BillingCategory.API))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("ownerUserId");
            assertThatThrownBy(
                            () ->
                                    new ChargeContext(
                                            1L,
                                            2L,
                                            null,
                                            ProcessType.SINGLE_TOOL,
                                            BillingCategory.API))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("source");
            assertThatThrownBy(
                            () ->
                                    new ChargeContext(
                                            1L, 2L, JobSource.API, null, BillingCategory.API))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("processType");
            assertThatThrownBy(
                            () ->
                                    new ChargeContext(
                                            1L, 2L, JobSource.API, ProcessType.SINGLE_TOOL, null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("billingCategory");
        }

        @Test
        @DisplayName("equal values produce equal records")
        void valueSemantics() {
            ChargeContext a =
                    new ChargeContext(
                            1L, 2L, JobSource.API, ProcessType.SINGLE_TOOL, BillingCategory.API);
            ChargeContext b =
                    new ChargeContext(
                            1L, 2L, JobSource.API, ProcessType.SINGLE_TOOL, BillingCategory.API);
            assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
            assertThat(a.toString()).contains("ChargeContext");
        }
    }

    @Nested
    @DisplayName("ChargeOutcome")
    class ChargeOutcomeTests {

        @Test
        @DisplayName("OPENED carries the would-be charge units")
        void opened() {
            UUID id = UUID.randomUUID();
            ChargeOutcome outcome = new ChargeOutcome(id, 5, Disposition.OPENED);
            assertThat(outcome.processId()).isEqualTo(id);
            assertThat(outcome.units()).isEqualTo(5);
            assertThat(outcome.disposition()).isEqualTo(Disposition.OPENED);
        }

        @Test
        @DisplayName("JOINED carries zero incremental units")
        void joined() {
            ChargeOutcome outcome = new ChargeOutcome(UUID.randomUUID(), 0, Disposition.JOINED);
            assertThat(outcome.units()).isZero();
            assertThat(outcome.disposition()).isEqualTo(Disposition.JOINED);
        }

        @Test
        @DisplayName("Disposition enum exposes exactly OPENED and JOINED")
        void dispositionValues() {
            assertThat(Disposition.values())
                    .containsExactly(Disposition.OPENED, Disposition.JOINED);
            assertThat(Disposition.valueOf("OPENED")).isEqualTo(Disposition.OPENED);
        }
    }

    @Nested
    @DisplayName("JobInput")
    class JobInputTests {

        private final MultipartFile file =
                new MockMultipartFile("file", "in.pdf", "application/pdf", new byte[] {1, 2, 3});
        private final Path path = Path.of("in.pdf");

        @Test
        @DisplayName("exposes the multipart and path it was built with")
        void accessors() {
            JobInput input = new JobInput(file, path);
            assertThat(input.multipart()).isSameAs(file);
            assertThat(input.path()).isEqualTo(path);
        }

        @Test
        @DisplayName("rejects a null multipart")
        void rejectsNullMultipart() {
            assertThatThrownBy(() -> new JobInput(null, path))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("multipart");
        }

        @Test
        @DisplayName("rejects a null path")
        void rejectsNullPath() {
            assertThatThrownBy(() -> new JobInput(file, null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("path");
        }
    }
}
