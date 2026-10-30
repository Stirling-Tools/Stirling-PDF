package stirling.software.proprietary.policy.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
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
 *   <li>in the desktop bundle everything else is permitted: the local operator picking a directory
 *       on their own machine is the authorization, and an allowlist would only gate them from their
 *       own files;
 *   <li>Stirling-owned "implied" roots are always permitted (even with none configured): the local
 *       server file-storage directory when that storage provider is enabled, and the pipeline
 *       watched-folder directories, so automations use them without the admin listing them;
 *   <li>must resolve within {@code policies.allowedFolderRoots}; none configured means all denied.
 * </ol>
 *
 * <p>Compared after normalisation so {@code ..} cannot escape a root. Symlink escape is not
 * defended: an operator who roots an allowlist on a symlink to a sensitive location is trusted.
 */
@Component
public class FolderAccessGuard {

    public static final String FOLDER_TYPE = "folder";

    private final boolean saasActive;
    private final boolean desktopOperator;
    private final List<Path> allowedRoots;
    private final List<Path> protectedRoots;
    private final SourceStore sourceStore;

    public FolderAccessGuard(
            ApplicationProperties applicationProperties,
            RuntimePathConfig runtimePathConfig,
            Environment environment,
            SourceStore sourceStore) {
        this.saasActive = Arrays.asList(environment.getActiveProfiles()).contains("saas");
        this.desktopOperator = isDesktopBundle();
        this.allowedRoots =
                normalizeAll(applicationProperties.getPolicies().getAllowedFolderRoots());
        this.protectedRoots = protectedRoots(applicationProperties.getStorage(), runtimePathConfig);
        this.sourceStore = sourceStore;
    }

    /**
     * True only in the bundled desktop app, whose sidecar launches the jar with {@code
     * -DSTIRLING_PDF_TAURI_MODE=true}. Read from the JVM's own system properties so a server cannot
     * inherit it from the environment or settings.yml, and absent means "not desktop", which is the
     * safe side: a self-hosted server with login off is exactly the case this must not open up.
     *
     * <p>Unlike {@code HardwareKeyStoreService.isDesktop()} a {@code Client-*} machine type is not
     * accepted, because that only reflects {@code BROWSER_OPEN}, which any server can set.
     */
    private static boolean isDesktopBundle() {
        return Boolean.parseBoolean(System.getProperty("STIRLING_PDF_TAURI_MODE", "false"));
    }

    /** Returns the normalised absolute path; throws if not permitted. */
    public Path requirePermitted(Path dir) {
        if (saasActive) {
            throw new IllegalArgumentException(
                    "folder sources and outputs are not available in SaaS mode");
        }
        if (!dir.isAbsolute()) {
            throw new IllegalArgumentException("folder must be an absolute path");
        }
        Path normalized = normalize(dir);
        if (isProtected(normalized)) {
            throw new IllegalArgumentException(
                    "folder may not point inside a protected Stirling directory");
        }
        // The desktop operator's own choice is the authorization on their own machine; only the
        // SaaS refusal and the protected config dir above outrank it.
        if (desktopOperator) {
            return normalized;
        }
        if (allowedRoots.isEmpty()) {
            throw new FolderAccessDeniedException(
                    "folder access is disabled; set policies.allowedFolderRoots to permit it");
        }
        boolean within = allowedRoots.stream().anyMatch(normalized::startsWith);
        if (!within) {
            throw new FolderAccessDeniedException(
                    "folder '" + normalized + "' is outside the allowed folder roots");
        }
        return normalized;
    }

    public boolean isProtected(Path path) {
        Path normalized = normalize(path);
        Path resolved = resolveExisting(normalized);
        return protectedRoots.stream()
                .anyMatch(
                        root -> {
                            Path resolvedRoot = resolveExisting(root);
                            return normalized.startsWith(root)
                                    || normalized.startsWith(resolvedRoot)
                                    || resolved.startsWith(root)
                                    || resolved.startsWith(resolvedRoot);
                        });
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

    private static List<Path> protectedRoots(
            ApplicationProperties.Storage storage, RuntimePathConfig runtimePathConfig) {
        List<Path> roots = new ArrayList<>();
        roots.add(normalize(Path.of(InstallationPathConfig.getConfigPath())));
        String basePath = storage.getLocal().getBasePath();
        if (basePath == null || basePath.isBlank()) {
            basePath = InstallationPathConfig.getPath() + "storage";
        }
        roots.add(normalize(Path.of(basePath)));
        roots.addAll(normalizeAll(runtimePathConfig.getPipelineWatchedFoldersPaths()));
        return List.copyOf(roots);
    }

    private static Path resolveExisting(Path normalized) {
        Path existing = normalized;
        while (existing != null && !Files.exists(existing)) {
            existing = existing.getParent();
        }
        if (existing == null) {
            return normalized;
        }
        try {
            return existing.toRealPath().resolve(existing.relativize(normalized)).normalize();
        } catch (IOException | SecurityException e) {
            return normalized;
        }
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
