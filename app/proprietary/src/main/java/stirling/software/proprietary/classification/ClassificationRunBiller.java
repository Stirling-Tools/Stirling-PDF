package stirling.software.proprietary.classification;

/**
 * Meters a non-AI (client-side heuristic) classification run so it bills like the AI classify path.
 * Flavor-specific: SaaS charges PAYG; other builds have no bean (audit still records the run).
 */
public interface ClassificationRunBiller {

    /** Charge one classification policy run covering {@code documentCount} documents. */
    void recordClassificationRun(int documentCount);
}
