package stirling.software.proprietary.failure;

import stirling.software.proprietary.policy.model.Policy;

/**
 * What produced a notification, so a row a reader never asked for can say where the work came from
 * rather than reading as a failure with no story.
 */
public enum SourceKind {

    /** A folder the server watches for its owner, processing what lands in it. */
    SMART_FOLDER,

    /** A policy the team runs over a source: the org automation surface. */
    POLICY,

    /** The reader's own editor. No source at all, so nothing to name. */
    EDITOR;

    /** The kind a row's producing policy implies. */
    public static SourceKind of(Policy policy) {
        return Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()) ? SMART_FOLDER : POLICY;
    }
}
