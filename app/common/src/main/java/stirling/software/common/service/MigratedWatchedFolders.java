package stirling.software.common.service;

import java.nio.file.Path;

/**
 * Watched folders now driven by a policy, so the legacy scanner skips them instead of processing
 * them twice. Implemented by the policy module; an absent bean means nothing has been migrated.
 */
public interface MigratedWatchedFolders {

    boolean isMigrated(Path directory);
}
