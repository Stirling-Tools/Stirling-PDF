package stirling.software.proprietary.notification;

import stirling.software.proprietary.policy.model.Policy;

/**
 * What produced a notification, so a row can say where the work came from. A reader who never
 * pressed anything is owed that much: "your smart folder could not read this" rather than a failure
 * with no story.
 */
public enum SourceKind {

    /** A folder the server watches for its owner, processing what lands in it. */
    SMART_FOLDER,

    /** A policy the team runs over a source: the org automation surface. */
    POLICY,

    /** The reader's own editor. No source at all, so nothing to name. */
    EDITOR;

    /** The kind a row's producing policy implies, or {@link #EDITOR} when nothing produced it. */
    public static SourceKind of(Policy policy) {
        if (policy == null) {
            return EDITOR;
        }
        return Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()) ? SMART_FOLDER : POLICY;
    }
}
