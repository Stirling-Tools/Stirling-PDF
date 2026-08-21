package stirling.software.saas.payg.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot;
import stirling.software.saas.payg.entitlement.WalletEntitlementSnapshot.WalletEntitlementSnapshotId;
import stirling.software.saas.payg.job.JobArtifactHash;
import stirling.software.saas.payg.job.JobArtifactHash.JobArtifactHashId;
import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.job.ProcessingJobStep;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.shadow.PaygShadowCharge;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;
import stirling.software.saas.payg.wallet.WalletPolicy;

/**
 * Boots each PAYG entity via the no-arg constructor that JPA requires, exercises a few getter /
 * setter pairs, and confirms composite-key equality where applicable. Catches Lombok / annotation
 * regressions without needing a database.
 */
class PaygEntitiesSmokeTest {

    @Test
    void pricingPolicy_instantiatesAndRoundTripsFields() {
        PricingPolicy p = new PricingPolicy();
        p.setVersion("v1-2026-06");
        p.setDocPagesPerUnit(25);
        p.setDocBytesPerUnit(10L * 1024 * 1024);
        p.setStepLimits(Map.of(JobSource.WEB, 10, JobSource.API, 20));
        p.setStripePriceIds(Set.of("price_abc", "price_def"));

        assertThat(p.getVersion()).isEqualTo("v1-2026-06");
        assertThat(p.getStepLimits())
                .containsEntry(JobSource.WEB, 10)
                .containsEntry(JobSource.API, 20)
                .hasSize(2);
        assertThat(p.getStripePriceIds()).containsExactlyInAnyOrder("price_abc", "price_def");
    }

    @Test
    void pricingPolicy_convenienceCtorValidates() {
        // Existing classifier callsite uses this ctor — verify the validation it carries from the
        // previous record stays in place.
        PricingPolicy p = new PricingPolicy(25, 10L * 1024 * 1024, 1, 1000);
        assertThat(p.getDocPagesPerUnit()).isEqualTo(25);
        assertThat(p.getFileUnitCap()).isEqualTo(1000);
    }

    @Test
    void processingJob_acceptsAllStatuses() {
        ProcessingJob job = new ProcessingJob();
        job.setId(UUID.randomUUID());
        job.setOwnerUserId(42L);
        job.setProcessType(ProcessType.CHAIN);
        job.setSource(JobSource.WEB);
        job.setStatus(JobStatus.OPEN);
        job.setStartedAt(LocalDateTime.now());
        job.setLastStepAt(LocalDateTime.now());

        assertThat(job.getProcessType()).isEqualTo(ProcessType.CHAIN);
        assertThat(job.getStatus()).isEqualTo(JobStatus.OPEN);
    }

    @Test
    void processingJobStep_isInstantiable() {
        ProcessingJobStep step = new ProcessingJobStep();
        step.setJobId(UUID.randomUUID());
        step.setToolId("/api/v1/general/compress");
        step.setStatus(JobStepStatus.OK);

        assertThat(step.getStatus()).isEqualTo(JobStepStatus.OK);
    }

    @Test
    void jobArtifactHash_compositeIdEqualityHolds() {
        UUID jobId = UUID.randomUUID();
        JobArtifactHashId a = new JobArtifactHashId(jobId, "abc123", ArtifactKind.INPUT);
        JobArtifactHashId b = new JobArtifactHashId(jobId, "abc123", ArtifactKind.INPUT);
        JobArtifactHashId different = new JobArtifactHashId(jobId, "abc123", ArtifactKind.OUTPUT);

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        assertThat(a).isNotEqualTo(different);

        JobArtifactHash row = new JobArtifactHash();
        row.setId(a);
        assertThat(row.getId().getKind()).isEqualTo(ArtifactKind.INPUT);
    }

    @Test
    void walletLedgerEntry_signedAmountAllowed() {
        WalletLedgerEntry entry = new WalletLedgerEntry();
        entry.setTeamId(7L);
        entry.setEntryType(LedgerEntryType.DEBIT);
        entry.setBucket(LedgerBucket.CYCLE);
        entry.setAmountUnits(-4);
        entry.setReferenceType(ReferenceType.JOB);
        entry.setReferenceId("job:abc");

        assertThat(entry.getAmountUnits()).isEqualTo(-4);
    }

    @Test
    void walletLedgerEntry_billingCategoryRoundTrips() {
        WalletLedgerEntry entry = new WalletLedgerEntry();
        // Default (unset) is null — captured by both the legacy debit path and pre-V16 rows.
        assertThat(entry.getBillingCategory()).isNull();

        entry.setBillingCategory(BillingCategory.AUTOMATION);
        assertThat(entry.getBillingCategory()).isEqualTo(BillingCategory.AUTOMATION);
    }

    @Test
    void walletPolicy_carriesSensibleDefaults() {
        WalletPolicy policy = new WalletPolicy();

        assertThat(policy.getEngine()).isEqualTo(WalletEngine.LEGACY);
        assertThat(policy.getCapPeriod()).isEqualTo(CapPeriod.CALENDAR_MONTH);
        assertThat(policy.getWarnAtPct()).isEqualTo(80);
        assertThat(policy.getDegradeAtPct()).isEqualTo(100);
        assertThat(policy.getDegradedFeatureSet()).isEqualTo(FeatureSet.MINIMAL);
        assertThat(policy.getAutoGroupStrategy()).isEqualTo(AutoGroupStrategy.AUTO);
    }

    @Test
    void walletEntitlementSnapshot_compositeIdHandlesTeamWideSentinel() {
        WalletEntitlementSnapshotId teamWide =
                new WalletEntitlementSnapshotId(7L, WalletEntitlementSnapshot.TEAM_WIDE_USER_ID);
        WalletEntitlementSnapshotId memberA = new WalletEntitlementSnapshotId(7L, 42L);

        assertThat(teamWide).isNotEqualTo(memberA);
        assertThat(teamWide.getUserId()).isZero();

        WalletEntitlementSnapshot snap = new WalletEntitlementSnapshot();
        snap.setId(teamWide);
        snap.setEnabledGates(List.of(FeatureGate.OFFSITE_PROCESSING, FeatureGate.AUTOMATION));

        assertThat(snap.getState()).isEqualTo(EntitlementState.FULL);
        assertThat(snap.getEnabledGates()).hasSize(2);
    }

    @Test
    void paygShadowCharge_isInstantiable() {
        PaygShadowCharge row = new PaygShadowCharge();
        row.setTeamId(7L);
        row.setJobId(UUID.randomUUID());
        row.setPolicyId(1L);
        row.setPaygUnits(4);
        row.setLegacyCreditsCharged(20);
        row.setDiffPct(-80);

        assertThat(row.getDiffPct()).isNegative();
    }

    @Test
    void paygShadowCharge_billingCategoryAndJobSourceRoundTrip() {
        PaygShadowCharge row = new PaygShadowCharge();
        assertThat(row.getBillingCategory()).isNull();
        assertThat(row.getJobSource()).isNull();

        row.setBillingCategory(BillingCategory.AI);
        row.setJobSource(JobSource.API);

        assertThat(row.getBillingCategory()).isEqualTo(BillingCategory.AI);
        assertThat(row.getJobSource()).isEqualTo(JobSource.API);
    }

    @Test
    void billingCategory_listingOrderIsStable() {
        // No downstream relies on ordinal() today, but the comment in the enum claims BYPASSED is
        // declared first as the default sentinel — guard against an accidental reorder.
        assertThat(BillingCategory.values())
                .containsExactly(
                        BillingCategory.BYPASSED,
                        BillingCategory.API,
                        BillingCategory.AI,
                        BillingCategory.AUTOMATION);
    }
}
