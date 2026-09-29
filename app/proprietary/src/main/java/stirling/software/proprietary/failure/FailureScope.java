package stirling.software.proprietary.failure;

/**
 * What the failure is about, which is what the dedup key groups repeats by: one file, run, policy,
 * source, or the whole server.
 */
public enum FailureScope {
    FILE,
    RUN,
    POLICY,
    SOURCE,
    SERVER
}
