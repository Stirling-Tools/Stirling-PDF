package stirling.software.proprietary.failure;

import stirling.software.proprietary.policy.model.Policy;

/**
 * Which surface of the app produced a failure row, read from the producing policy. Not a source: a
 * source is the folder, bucket or webhook a policy pulls from, and a smart folder is a policy.
 */
public enum ProducingSurface {

    /** A processing-folder policy: a folder the server watches for its owner. */
    SMART_FOLDER,

    /** A team policy, run over whatever sources it is bound to. */
    POLICY,

    /** The reader's own editor, with no policy behind the run. */
    EDITOR;

    /** The kind a row's producing policy implies. */
    public static ProducingSurface of(Policy policy) {
        return Policy.SURFACE_PROCESSING_FOLDER.equals(policy.surface()) ? SMART_FOLDER : POLICY;
    }
}
