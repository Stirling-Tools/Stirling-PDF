package stirling.software.proprietary.policy.config;

/**
 * A folder path was rejected only because it falls outside the configured/implied allowed roots - a
 * condition an admin can resolve by adding the root under the Folder Access settings. Distinct from
 * the guard's other rejections (SaaS mode, the protected config dir), which editing the allowlist
 * cannot fix, so callers can offer a "go to settings" affordance for this case alone.
 */
public class FolderAccessDeniedException extends IllegalArgumentException {

    public FolderAccessDeniedException(String message) {
        super(message);
    }
}
