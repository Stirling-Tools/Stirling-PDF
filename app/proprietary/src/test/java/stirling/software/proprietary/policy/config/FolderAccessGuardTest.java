package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Tests for {@link FolderAccessGuard}: folder access is fail-closed, confined to the configured
 * allowed roots, never reaches Stirling's own config directory, and is off entirely under SaaS.
 */
class FolderAccessGuardTest {

    private static final String TAURI_MODE_PROPERTY = "STIRLING_PDF_TAURI_MODE";

    @TempDir Path tempDir;

    private final SourceStore sourceStore = new InProcessSourceStore();

    private FolderAccessGuard guard(List<String> allowedRoots, String... activeProfiles) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(allowedRoots);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles(activeProfiles);
        return new FolderAccessGuard(
                properties, new RuntimePathConfig(properties), environment, sourceStore);
    }

    private FolderAccessGuard guardWithStorage(
            List<String> allowedRoots, boolean storageEnabled, String provider, String basePath) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(allowedRoots);
        ApplicationProperties.Storage storage = properties.getStorage();
        storage.setEnabled(storageEnabled);
        storage.setProvider(provider);
        storage.getLocal().setBasePath(basePath);
        return new FolderAccessGuard(
                properties,
                new RuntimePathConfig(properties),
                new StandardEnvironment(),
                sourceStore);
    }

    private FolderAccessGuard guardWithWatchedFolder(String watchedDir, List<String> allowedRoots) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(true);
        properties.getPolicies().setAllowedFolderRoots(allowedRoots);
        properties
                .getSystem()
                .getCustomPaths()
                .getPipeline()
                .setWatchedFoldersDirs(List.of(watchedDir));
        return new FolderAccessGuard(
                properties,
                new RuntimePathConfig(properties),
                new StandardEnvironment(),
                sourceStore);
    }

    @Test
    void permitsAndNormalisesADirectoryWithinAnAllowedRoot() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()));
        Path within = tempDir.resolve("inbox");

        assertEquals(within.toAbsolutePath().normalize(), guard.requirePermitted(within));
    }

    @Test
    void rejectsADirectoryOutsideEveryAllowedRoot() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()));
        // FolderAccessDeniedException (not the base type): the admin can fix this in settings.
        assertThrows(
                FolderAccessDeniedException.class,
                () -> guard.requirePermitted(tempDir.resolveSibling("elsewhere")));
    }

    @Test
    void rejectsTraversalThatWalksOutOfAnAllowedRoot() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()));
        assertThrows(
                FolderAccessDeniedException.class,
                () -> guard.requirePermitted(tempDir.resolve("..").resolve("escaped")));
    }

    @Test
    void deniesAnUnlistedDirectoryOnAServerWithLoginOff() {
        // Login off does not mean "desktop": a self-hosted server runs this way by default, and
        // there every caller is unauthenticated, so the allowlist is all that stands between them
        // and the filesystem.
        assertThrows(
                FolderAccessDeniedException.class,
                () -> guardWithLoginOff().requirePermitted(tempDir));
    }

    @Test
    void permitsAnyDirectoryInTheDesktopBundle() {
        withDesktopBundle(
                () ->
                        assertEquals(
                                tempDir.toAbsolutePath().normalize(),
                                guardWithLoginOff().requirePermitted(tempDir)));
    }

    @Test
    void permitsAnyDirectoryInTheDesktopBundleWithLoginOn() {
        // Signing in identifies the operator rather than demoting them: the desktop bundle is the
        // whole trust claim, so a login-enabled install still reaches the operator's own files.
        withDesktopBundle(
                () ->
                        assertEquals(
                                tempDir.toAbsolutePath().normalize(),
                                guard(List.of()).requirePermitted(tempDir)));
    }

    private FolderAccessGuard guardWithLoginOff() {
        ApplicationProperties properties = new ApplicationProperties();
        return new FolderAccessGuard(
                properties,
                new RuntimePathConfig(properties),
                new StandardEnvironment(),
                sourceStore);
    }

    /** Runs the body with the flag the desktop sidecar sets, restoring whatever was there. */
    private static void withDesktopBundle(Runnable body) {
        String previous = System.getProperty(TAURI_MODE_PROPERTY);
        System.setProperty(TAURI_MODE_PROPERTY, "true");
        try {
            body.run();
        } finally {
            if (previous == null) {
                System.clearProperty(TAURI_MODE_PROPERTY);
            } else {
                System.setProperty(TAURI_MODE_PROPERTY, previous);
            }
        }
    }

    @Test
    void rejectsEverythingWhenNoRootsAreConfigured() {
        FolderAccessGuard guard = guard(List.of());
        assertThrows(FolderAccessDeniedException.class, () -> guard.requirePermitted(tempDir));
    }

    @Test
    void rejectsTheLocalStorageDirectoryEvenInsideAnAllowedRoot() {
        Path storageBase = tempDir.resolve("storage");
        FolderAccessGuard guard =
                guardWithStorage(
                        List.of(tempDir.toString()), true, "local", storageBase.toString());

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(storageBase.resolve("4")));
        assertFalse(ex instanceof FolderAccessDeniedException);
        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(storageBase));
        assertTrue(guard.isProtected(storageBase.resolve("4").resolve("doc.pdf")));
        assertFalse(guard.isProtected(tempDir));
    }

    @Test
    void rejectsTheStorageDirectoryWhateverTheProviderOrEnabledFlag() {
        Path storageBase = tempDir.resolve("storage");
        for (FolderAccessGuard guard :
                List.of(
                        guardWithStorage(
                                List.of(tempDir.toString()),
                                false,
                                "local",
                                storageBase.toString()),
                        guardWithStorage(
                                List.of(tempDir.toString()), true, "s3", storageBase.toString()))) {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> guard.requirePermitted(storageBase.resolve("4")));
        }
    }

    @Test
    void rejectsTheStorageDirectoryWithNoConfiguredRoots() {
        Path storageBase = tempDir.resolve("storage");
        FolderAccessGuard guard =
                guardWithStorage(List.of(), true, "local", storageBase.toString());

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(storageBase.resolve("3")));
        assertFalse(ex instanceof FolderAccessDeniedException);
    }

    @Test
    void rejectsPipelineWatchedFoldersWithNoConfiguredRoots() {
        Path watched = tempDir.resolve("watched");
        FolderAccessGuard guard = guardWithWatchedFolder(watched.toString(), List.of());

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(watched.resolve("drop")));
        assertFalse(ex instanceof FolderAccessDeniedException);
        assertTrue(guard.isProtected(watched.resolve("drop").resolve("config.json")));
    }

    @Test
    void rejectsPipelineWatchedFoldersEvenInsideAnAllowedRoot() {
        Path watched = tempDir.resolve("pipeline").resolve("watchedFolders");
        FolderAccessGuard guard =
                guardWithWatchedFolder(watched.toString(), List.of(tempDir.toString()));

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(watched.resolve("drop")));
        assertFalse(ex instanceof FolderAccessDeniedException);
        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(watched));
        assertEquals(
                tempDir.resolve("pipeline").resolve("finishedFolders").toAbsolutePath().normalize(),
                guard.requirePermitted(tempDir.resolve("pipeline").resolve("finishedFolders")));
    }

    @Test
    void rejectsPipelineWatchedFoldersInTheDesktopBundle() {
        Path watched = tempDir.resolve("watched");
        withDesktopBundle(
                () ->
                        assertThrows(
                                IllegalArgumentException.class,
                                () ->
                                        guardWithWatchedFolder(watched.toString(), List.of())
                                                .requirePermitted(watched.resolve("drop"))));
    }

    @Test
    void rejectsRelativePaths() {
        FolderAccessGuard guard =
                guardWithStorage(
                        List.of(Path.of("").toAbsolutePath().toString()), true, "local", "storage");

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(Path.of("storage", "3")));
        assertFalse(ex instanceof FolderAccessDeniedException);
        assertThrows(
                IllegalArgumentException.class,
                () -> guard.requirePermitted(Path.of("pipeline", "watchedFolders", "drop")));
        assertTrue(guard.isProtected(Path.of("storage", "3")));
    }

    @Test
    void rejectsASymlinkInsideAnAllowedRootThatPointsIntoAProtectedRoot() throws Exception {
        Path watched = Files.createDirectories(tempDir.resolve("watched"));
        Path allowed = Files.createDirectories(tempDir.resolve("allowed"));
        Path link = Files.createSymbolicLink(allowed.resolve("link"), watched);
        FolderAccessGuard guard =
                guardWithWatchedFolder(watched.toString(), List.of(allowed.toString()));

        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(link));
        assertThrows(
                IllegalArgumentException.class, () -> guard.requirePermitted(link.resolve("drop")));
        assertTrue(guard.isProtected(link.resolve("drop")));
        assertEquals(
                allowed.resolve("inbox").toAbsolutePath().normalize(),
                guard.requirePermitted(allowed.resolve("inbox")));
    }

    @Test
    void rejectsTheStirlingConfigDirectoryEvenWhenItWouldBeInsideAnAllowedRoot() {
        Path configDir =
                Path.of(InstallationPathConfig.getConfigPath()).toAbsolutePath().normalize();
        // Allow the config dir's parent, so only the protected-path rule can reject it.
        FolderAccessGuard guard = guard(List.of(configDir.getParent().toString()));

        // Not a FolderAccessDeniedException: editing the allowlist can't unprotect the config dir.
        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> guard.requirePermitted(configDir.resolve("settings.yml")));
        assertFalse(ex instanceof FolderAccessDeniedException);
    }

    @Test
    void refusesAllFolderAccessUnderTheSaasProfile() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()), "saas");
        // Not a FolderAccessDeniedException: SaaS has no folder allowlist to point the admin at.
        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(tempDir));
        assertFalse(ex instanceof FolderAccessDeniedException);
    }

    @Test
    void usesFolderAccessDetectsFolderSourcesAndOutputs() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()));

        assertTrue(
                guard.usesFolderAccess(
                        policy(List.of(InputSpec.folder("/in")), OutputSpec.inline())));
        assertTrue(guard.usesFolderAccess(policy(List.of(), OutputSpec.folder("/out"))));
        assertFalse(guard.usesFolderAccess(policy(List.of(), OutputSpec.inline())));
    }

    private Policy policy(List<InputSpec> sources, OutputSpec output) {
        List<String> sourceIds =
                sources.stream()
                        .map(
                                spec ->
                                        sourceStore
                                                .save(
                                                        new Source(
                                                                null,
                                                                "src",
                                                                spec.type(),
                                                                spec.options(),
                                                                true,
                                                                "owner",
                                                                null))
                                                .id())
                        .toList();
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                sourceIds.stream().map(PipelineInput::manual).toList(),
                List.of(),
                output);
    }
}
