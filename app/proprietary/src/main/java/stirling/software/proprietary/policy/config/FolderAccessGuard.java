package stirling.software.proprietary.policy.config;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Authority on which filesystem locations a policy may read/write. Checked at save time and again
 * at run time, fail-closed in order:
 *
 * <ol>
 *   <li>denied entirely under the {@code saas} profile;
 *   <li>Stirling's own config dir always rejected, even if an allowed root were misconfigured to
 *       contain it;
 *   <li>must resolve within {@code policies.allowedFolderRoots}; none configured means all denied.
 * </ol>
 *
 * <p>Compared after normalisation so {@code ..} cannot escape a root. Symlink escape is not
 * defended: an operator who roots an allowlist on a symlink to a sensitive location is trusted.
 */
@Component
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class FolderAccessGuard {

    public static final String FOLDER_TYPE = "folder";

    private final boolean saasActive;
    private final List<Path> allowedRoots;
    private final List<Path> protectedRoots;
    private final SourceStore sourceStore;

    public FolderAccessGuard(
            ApplicationProperties applicationProperties,
            Environment environment,
            SourceStore sourceStore) {
        this.saasActive = Arrays.asList(environment.getActiveProfiles()).contains("saas");
        this.allowedRoots =
                normalizeAll(applicationProperties.getPolicies().getAllowedFolderRoots());
        this.protectedRoots = List.of(normalize(Path.of(InstallationPathConfig.getConfigPath())));
        this.sourceStore = sourceStore;
    }

    /** Returns the normalised absolute path; throws if not permitted. */
    public Path requirePermitted(Path dir) {
        if (saasActive) {
            throw new IllegalArgumentException(
                    "folder sources and outputs are not available in SaaS mode");
        }
        Path normalized = normalize(dir);
        for (Path protectedRoot : protectedRoots) {
            if (normalized.startsWith(protectedRoot)) {
                throw new IllegalArgumentException(
                        "folder may not point inside a protected Stirling directory");
            }
        }
        if (allowedRoots.isEmpty()) {
            throw new IllegalArgumentException(
                    "folder access is disabled; set policies.allowedFolderRoots to permit it");
        }
        boolean within = allowedRoots.stream().anyMatch(normalized::startsWith);
        if (!within) {
            throw new IllegalArgumentException(
                    "folder '" + normalized + "' is outside the allowed folder roots");
        }
        return normalized;
    }

    /** Whether this policy touches a folder source/sink, and so is subject to these rules. */
    public boolean usesFolderAccess(Policy policy) {
        boolean readsFolder =
                policy.sourceIds().stream()
                        .map(sourceStore::get)
                        .flatMap(Optional::stream)
                        .anyMatch(source -> FOLDER_TYPE.equals(source.type()));
        boolean writesFolder =
                policy.output() != null && FOLDER_TYPE.equals(policy.output().type());
        return readsFolder || writesFolder;
    }

    private static List<Path> normalizeAll(List<String> roots) {
        List<Path> result = new ArrayList<>();
        for (String root : roots) {
            if (root != null && !root.isBlank()) {
                result.add(normalize(Path.of(root)));
            }
        }
        return result;
    }

    private static Path normalize(Path path) {
        return path.toAbsolutePath().normalize();
    }
}
