package stirling.software.proprietary.failure;

/**
 * What kind of run failed, not where it was started from. A policy is a policy whether a schedule
 * fired it or someone clicked Run in the editor, so the two questions are answered separately:
 * {@code actor} names the person for an attended run and {@code sourceId} names the folder, bucket
 * or webhook for an unattended one.
 */
public enum FailureOrigin {

    /** One tool called directly, with no policy around it. Today that means the editor. */
    TOOL,

    /** The policy engine ran it, however the run was triggered. */
    POLICY,

    /**
     * The watched-folder pipeline that predates policies. Declared ahead of its producer: nothing
     * writes this yet, because that pipeline records no failures at all. Instrumenting it is its
     * own piece of work.
     */
    PIPELINE
}
