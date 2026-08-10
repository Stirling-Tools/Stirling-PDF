package stirling.software.common.service;

import java.nio.file.Path;

/**
 * Watched-folder directories whose legacy JSON config has been converted into a policy, so the
 * legacy directory scanner leaves them to the policy engine rather than processing them twice.
 *
 * <p>Implemented by the policy module. The scanner treats an absent bean (a build without that
 * module) as "nothing migrated" and keeps its original behaviour.
 */
public interface MigratedWatchedFolders {

    /** Whether this directory is now driven by a policy rather than the legacy scanner. */
    boolean isMigrated(Path directory);
}
