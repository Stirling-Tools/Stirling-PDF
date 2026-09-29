package fixtures;

class Restates {

    void run(Registry registry, Job job) {
        // Clear the registry
        registry.clear();

        // Sanitize filename
        String safeFilename = sanitizeFilename(job.originalFilename());

        // Wait for the worker to drain before clearing, or an in-flight job
        // re-registers its temp file after the sweep.
        registry.awaitQuiescence();
    }

    // ---------- Internal helpers ----------

    // Types
    private enum Mode {
        FAST,
        SAFE
    }
}
