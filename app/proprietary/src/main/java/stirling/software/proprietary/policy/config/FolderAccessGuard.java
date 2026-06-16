package stirling.software.proprietary.policy.config;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.Policy;

/**
 * The single authority on which filesystem locations a policy may read from or write to. Folder
 * sources and sinks take a configured directory, so without this a user who can save a policy could
 * point one at Stirling's own config/secrets directory and exfiltrate (or overwrite) it. Every
 * folder source and sink runs its directory through {@link #requirePermitted(Path)} at save time
 * and again at run time.
 *
 * <p>Enforced fail-closed, in order:
 *
 * <ul>
 *   <li><b>Disabled in SaaS</b> - folder access is never allowed when the {@code saas} profile is
 *       active; a tenant must not reach the host filesystem at all.
 *   <li><b>Protected paths</b> - Stirling's own config directory (settings, database, keys,
 *       backups) is always rejected, even if an allowed root were misconfigured to contain it.
 *   <li><b>Allowlist</b> - the directory must resolve within one of {@code
 *       policies.allowedFolderRoots}; with none configured, all folder access is refused.
 * </ul>
 *
 * <p>Paths are compared after normalisation, so {@code ..} segments cannot walk out of an allowed
 * root. (Symlink escape is not defended here; an operator who configures an allowed root containing
 * a symlink to a sensitive location is trusted.)
 */
@Component
public class FolderAccessGuard {

    public static final String FOLDER_TYPE = "folder";

    private final boolean saasActive;
    private final List<Path> allowedRoots;
    private final List<Path> protectedRoots;

    public FolderAccessGuard(ApplicationProperties applicationProperties, Environment environment) {
        this.saasActive = Arrays.asList(environment.getActiveProfiles()).contains("saas");
        this.allowedRoots =
                normalizeAll(applicationProperties.getPolicies().getAllowedFolderRoots());
        this.protectedRoots = List.of(normalize(Path.of(InstallationPathConfig.getConfigPath())));
    }

    /**
     * Check that {@code dir} is a permitted folder location, returning its normalised absolute
     * form.
     *
     * @throws IllegalArgumentException if folder access is disabled (SaaS or no roots configured),
     *     the path is inside a protected directory, or it falls outside every allowed root
     */
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

    /** Whether this policy reads from or writes to a folder, and so is subject to these rules. */
    public boolean usesFolderAccess(Policy policy) {
        boolean readsFolder =
                policy.sources().stream().anyMatch(spec -> FOLDER_TYPE.equals(spec.type()));
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
