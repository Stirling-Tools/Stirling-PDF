package stirling.software.saas.payg.job;

/**
 * Output of {@link JobService#joinOrOpen}. {@code OPENED} means the charge layer should compute
 * units and record a shadow charge (or, post-shadow, actually debit). {@code JOINED} means the call
 * attached to an existing process — no further charge, just an audit-trail step append.
 *
 * <p>Step-limit overflow on a matched job surfaces as {@code OPENED}: the lineage tree is preserved
 * via shared input signatures, but the limit means we start a fresh billable process.
 */
public record JoinOrOpenResult(ProcessingJob job, Disposition disposition) {

    public enum Disposition {
        OPENED,
        JOINED
    }
}
