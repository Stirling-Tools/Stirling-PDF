package stirling.software.proprietary.classification;

/** Meters a client-side classification run; SaaS charges PAYG, other flavors have no bean. */
public interface ClassificationRunBiller {

    /** Charge one classification policy run covering {@code documentCount} documents. */
    void recordClassificationRun(int documentCount);
}
