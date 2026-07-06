package stirling.software.saas.payg.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.job.ProcessingJobStep;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.shadow.PaygShadowCharge;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Fills the coverage gaps PaygEntitiesSmokeTest leaves: PricingPolicy ctor validation failures, the
 * remaining entity setters/defaults, and the JobArtifactHash composite-id accessors.
 */
class PaygEntitiesMoreTest {

    @Nested
    @DisplayName("PricingPolicy convenience-ctor validation")
    class PricingPolicyValidation {

        @Test
        @DisplayName("rejects a non-positive docPagesPerUnit")
        void rejectsDocPages() {
            assertThatThrownBy(() -> new PricingPolicy(0, 1, 1, 1))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("docPagesPerUnit");
        }

        @Test
        @DisplayName("rejects a non-positive docBytesPerUnit")
        void rejectsDocBytes() {
            assertThatThrownBy(() -> new PricingPolicy(1, 0, 1, 1))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("docBytesPerUnit");
        }

        @Test
        @DisplayName("rejects a minChargeUnits below 1")
        void rejectsMinCharge() {
            assertThatThrownBy(() -> new PricingPolicy(1, 1, 0, 1))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("minChargeUnits");
        }

        @Test
        @DisplayName("rejects a fileUnitCap below 1")
        void rejectsFileUnitCap() {
            assertThatThrownBy(() -> new PricingPolicy(1, 1, 1, 0))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("fileUnitCap");
        }

        @Test
        @DisplayName("no-arg constructor carries the documented defaults")
        void noArgDefaults() {
            PricingPolicy p = new PricingPolicy();
            assertThat(p.getMinChargeUnits()).isEqualTo(1);
            assertThat(p.getFileUnitCap()).isEqualTo(1000);
            assertThat(p.getFreeTierUnits()).isZero();
            assertThat(p.getIsDefault()).isFalse();
            assertThat(p.getStepLimits()).isEmpty();
            assertThat(p.getStripePriceIds()).isEmpty();
        }

        @Test
        @DisplayName("remaining setters round-trip")
        void settersRoundTrip() {
            LocalDateTime from = LocalDateTime.of(2026, 6, 1, 0, 0);
            LocalDateTime to = LocalDateTime.of(2026, 12, 1, 0, 0);
            PricingPolicy p = new PricingPolicy();
            p.setId(3L);
            p.setEffectiveFrom(from);
            p.setEffectiveTo(to);
            p.setFreeTierUnits(50L);
            p.setIsDefault(Boolean.TRUE);
            p.setNotes("seed policy");
            p.setCreatedBy("admin@example.com");

            assertThat(p.getId()).isEqualTo(3L);
            assertThat(p.getEffectiveFrom()).isEqualTo(from);
            assertThat(p.getEffectiveTo()).isEqualTo(to);
            assertThat(p.getFreeTierUnits()).isEqualTo(50L);
            assertThat(p.getIsDefault()).isTrue();
            assertThat(p.getNotes()).isEqualTo("seed policy");
            assertThat(p.getCreatedBy()).isEqualTo("admin@example.com");
        }
    }

    @Nested
    @DisplayName("WalletLedgerEntry extra fields")
    class WalletLedger {

        @Test
        @DisplayName("metadata defaults to an empty mutable map")
        void metadataDefault() {
            assertThat(new WalletLedgerEntry().getMetadata()).isEmpty();
        }

        @Test
        @DisplayName("actor, policy, stripe-event, and metadata setters round-trip")
        void settersRoundTrip() {
            WalletLedgerEntry entry = new WalletLedgerEntry();
            entry.setId(9L);
            entry.setActorUserId(42L);
            entry.setPolicyId(3L);
            entry.setStripeEventId("evt_123");
            entry.setMetadata(Map.of("source", "grant"));
            entry.setOccurredAt(LocalDateTime.of(2026, 6, 1, 0, 0));

            assertThat(entry.getId()).isEqualTo(9L);
            assertThat(entry.getActorUserId()).isEqualTo(42L);
            assertThat(entry.getPolicyId()).isEqualTo(3L);
            assertThat(entry.getStripeEventId()).isEqualTo("evt_123");
            assertThat(entry.getMetadata()).containsEntry("source", "grant");
            assertThat(entry.getOccurredAt()).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
        }
    }

    @Nested
    @DisplayName("WalletPolicy extra fields")
    class Wallet {

        @Test
        @DisplayName("notificationEmails defaults to an empty mutable list and capUnits is null")
        void defaults() {
            WalletPolicy policy = new WalletPolicy();
            assertThat(policy.getNotificationEmails()).isEmpty();
            assertThat(policy.getCapUnits()).isNull();
            assertThat(policy.getCapSourceMoney()).isNull();
        }

        @Test
        @DisplayName("cap, threshold, and email setters round-trip")
        void settersRoundTrip() {
            WalletPolicy policy = new WalletPolicy();
            policy.setId(1L);
            policy.setTeamId(7L);
            policy.setEngine(WalletEngine.PAYG);
            policy.setCapPeriod(CapPeriod.BILLING_CYCLE);
            policy.setCapUnits(5000L);
            policy.setCapSourceMoney(5000L);
            policy.setWarnAtPct(75);
            policy.setDegradeAtPct(95);
            policy.setDegradedFeatureSet(FeatureSet.CLIENT_ONLY);
            policy.setAutoGroupStrategy(AutoGroupStrategy.OFF);
            policy.setNotificationEmails(List.of("ops@example.com"));

            assertThat(policy.getId()).isEqualTo(1L);
            assertThat(policy.getTeamId()).isEqualTo(7L);
            assertThat(policy.getEngine()).isEqualTo(WalletEngine.PAYG);
            assertThat(policy.getCapPeriod()).isEqualTo(CapPeriod.BILLING_CYCLE);
            assertThat(policy.getCapUnits()).isEqualTo(5000L);
            assertThat(policy.getCapSourceMoney()).isEqualTo(5000L);
            assertThat(policy.getWarnAtPct()).isEqualTo(75);
            assertThat(policy.getDegradeAtPct()).isEqualTo(95);
            assertThat(policy.getDegradedFeatureSet()).isEqualTo(FeatureSet.CLIENT_ONLY);
            assertThat(policy.getAutoGroupStrategy()).isEqualTo(AutoGroupStrategy.OFF);
            assertThat(policy.getNotificationEmails()).containsExactly("ops@example.com");
        }
    }

    @Nested
    @DisplayName("ProcessingJob extra fields")
    class Job {

        @Test
        @DisplayName("counters default to zero and metadata is an empty map")
        void defaults() {
            ProcessingJob job = new ProcessingJob();
            assertThat(job.getDocUnits()).isZero();
            assertThat(job.getStepCount()).isZero();
            assertThat(job.getMetadata()).isEmpty();
            assertThat(job.getChargedUnits()).isNull();
        }

        @Test
        @DisplayName("remaining setters round-trip")
        void settersRoundTrip() {
            UUID id = UUID.randomUUID();
            LocalDateTime closed = LocalDateTime.of(2026, 6, 1, 1, 0);
            ProcessingJob job = new ProcessingJob();
            job.setId(id);
            job.setOwnerTeamId(7L);
            job.setDocumentFingerprint("sha256-fp");
            job.setDocUnits(4);
            job.setStepCount(3);
            job.setClosedAt(closed);
            job.setPolicyId(2L);
            job.setChargedUnits(4);
            job.setChargedCents(400);
            job.setIdempotencyKey("open:abc");
            job.setMetadata(Map.of("k", "v"));

            assertThat(job.getId()).isEqualTo(id);
            assertThat(job.getOwnerTeamId()).isEqualTo(7L);
            assertThat(job.getDocumentFingerprint()).isEqualTo("sha256-fp");
            assertThat(job.getDocUnits()).isEqualTo(4);
            assertThat(job.getStepCount()).isEqualTo(3);
            assertThat(job.getClosedAt()).isEqualTo(closed);
            assertThat(job.getPolicyId()).isEqualTo(2L);
            assertThat(job.getChargedUnits()).isEqualTo(4);
            assertThat(job.getChargedCents()).isEqualTo(400);
            assertThat(job.getIdempotencyKey()).isEqualTo("open:abc");
            assertThat(job.getMetadata()).containsEntry("k", "v");
        }
    }

    @Nested
    @DisplayName("ProcessingJobStep extra fields")
    class Step {

        @Test
        @DisplayName("all setters round-trip")
        void settersRoundTrip() {
            UUID jobId = UUID.randomUUID();
            LocalDateTime started = LocalDateTime.of(2026, 6, 1, 0, 0);
            LocalDateTime completed = LocalDateTime.of(2026, 6, 1, 0, 1);
            ProcessingJobStep step = new ProcessingJobStep();
            step.setId(5L);
            step.setJobId(jobId);
            step.setToolId("/api/v1/general/merge");
            step.setStatus(JobStepStatus.FAILED);
            step.setStartedAt(started);
            step.setCompletedAt(completed);
            step.setInputPages(12);
            step.setInputBytes(2048L);
            step.setErrorCode("E_TIMEOUT");

            assertThat(step.getId()).isEqualTo(5L);
            assertThat(step.getJobId()).isEqualTo(jobId);
            assertThat(step.getToolId()).isEqualTo("/api/v1/general/merge");
            assertThat(step.getStatus()).isEqualTo(JobStepStatus.FAILED);
            assertThat(step.getStartedAt()).isEqualTo(started);
            assertThat(step.getCompletedAt()).isEqualTo(completed);
            assertThat(step.getInputPages()).isEqualTo(12);
            assertThat(step.getInputBytes()).isEqualTo(2048L);
            assertThat(step.getErrorCode()).isEqualTo("E_TIMEOUT");
        }
    }

    @Nested
    @DisplayName("PaygShadowCharge extra fields")
    class Shadow {

        @Test
        @DisplayName("defaults: CHARGED status and zero free units consumed")
        void defaults() {
            PaygShadowCharge row = new PaygShadowCharge();
            assertThat(row.getStatus()).isEqualTo(ShadowChargeStatus.CHARGED);
            assertThat(row.getFreeUnitsConsumed()).isZero();
            assertThat(row.getRefundedAt()).isNull();
            assertThat(row.getRefundReason()).isNull();
        }

        @Test
        @DisplayName("refund and free-unit setters round-trip")
        void settersRoundTrip() {
            LocalDateTime refundedAt = LocalDateTime.of(2026, 6, 1, 0, 2);
            PaygShadowCharge row = new PaygShadowCharge();
            row.setId(9L);
            row.setFreeUnitsConsumed(2);
            row.setStatus(ShadowChargeStatus.REFUNDED);
            row.setRefundedAt(refundedAt);
            row.setRefundReason("first-step-5xx:503");

            assertThat(row.getId()).isEqualTo(9L);
            assertThat(row.getFreeUnitsConsumed()).isEqualTo(2);
            assertThat(row.getStatus()).isEqualTo(ShadowChargeStatus.REFUNDED);
            assertThat(row.getRefundedAt()).isEqualTo(refundedAt);
            assertThat(row.getRefundReason()).isEqualTo("first-step-5xx:503");
        }
    }

    @Nested
    @DisplayName("JobArtifactHash composite id")
    class ArtifactHash {

        @Test
        @DisplayName("the embedded id exposes its components through getters")
        void idAccessors() {
            UUID jobId = UUID.randomUUID();
            JobArtifactHashId id = new JobArtifactHashId(jobId, "hash-1", ArtifactKind.OUTPUT);
            assertThat(id.getJobId()).isEqualTo(jobId);
            assertThat(id.getContentHash()).isEqualTo("hash-1");
            assertThat(id.getKind()).isEqualTo(ArtifactKind.OUTPUT);
        }

        @Test
        @DisplayName("the no-arg embedded id supports setter round-trips")
        void noArgIdSetters() {
            UUID jobId = UUID.randomUUID();
            JobArtifactHashId id = new JobArtifactHashId();
            id.setJobId(jobId);
            id.setContentHash("hash-2");
            id.setKind(ArtifactKind.INPUT);
            assertThat(id.getJobId()).isEqualTo(jobId);
            assertThat(id.getContentHash()).isEqualTo("hash-2");
            assertThat(id.getKind()).isEqualTo(ArtifactKind.INPUT);
        }

        @Test
        @DisplayName("id is unequal to null and to a foreign type")
        void idNotEqualNullOrForeign() {
            JobArtifactHashId id =
                    new JobArtifactHashId(UUID.randomUUID(), "h", ArtifactKind.INPUT);
            assertThat(id).isNotEqualTo(null).isNotEqualTo("string");
            assertThat(id).isEqualTo(id);
        }

        @Test
        @DisplayName("the row exposes its createdAt setter")
        void rowCreatedAt() {
            JobArtifactHash row = new JobArtifactHash();
            LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
            row.setCreatedAt(created);
            assertThat(row.getCreatedAt()).isEqualTo(created);
        }
    }
}
