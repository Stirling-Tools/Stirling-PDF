package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Path;
import java.util.List;

import org.eclipse.microprofile.config.Config;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import io.smallrye.config.SmallRyeConfig;

import stirling.software.common.configuration.InstallationPathConfig;
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
 *
 * <p>MIGRATION (Spring -> Quarkus): the guard now reads the active profile from MicroProfile {@link
 * Config} ({@code config.unwrap(SmallRyeConfig.class).getProfiles()}) instead of Spring's {@code
 * StandardEnvironment.setActiveProfiles(...)}. The {@code Config} is mocked accordingly.
 */
class FolderAccessGuardTest {

    @TempDir Path tempDir;

    private final SourceStore sourceStore = new InProcessSourceStore();

    private FolderAccessGuard guard(List<String> allowedRoots, String... activeProfiles) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedFolderRoots(allowedRoots);
        return new FolderAccessGuard(properties, configWithProfiles(activeProfiles));
    }

    /**
     * A {@link Config} whose unwrapped {@link SmallRyeConfig} reports the given active profiles.
     */
    private static Config configWithProfiles(String... activeProfiles) {
        SmallRyeConfig smallRyeConfig = mock(SmallRyeConfig.class);
        when(smallRyeConfig.getProfiles()).thenReturn(List.of(activeProfiles));
        Config config = mock(Config.class);
        when(config.unwrap(SmallRyeConfig.class)).thenReturn(smallRyeConfig);
        return config;
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
    void rejectsEverythingWhenNoRootsAreConfigured() {
        FolderAccessGuard guard = guard(List.of());
        assertThrows(FolderAccessDeniedException.class, () -> guard.requirePermitted(tempDir));
    }

    @Test
    void permitsTheLocalServerStorageDirectoryEvenWithNoConfiguredRoots() {
        Path storageBase = tempDir.resolve("storage");
        FolderAccessGuard guard =
                guardWithStorage(List.of(), true, "local", storageBase.toString());
        Path within = storageBase.resolve("inbox");

        assertEquals(within.toAbsolutePath().normalize(), guard.requirePermitted(within));
    }

    @Test
    void ignoresServerStorageWhenTheStorageFeatureIsDisabled() {
        Path storageBase = tempDir.resolve("storage");
        FolderAccessGuard guard =
                guardWithStorage(List.of(), false, "local", storageBase.toString());

        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(storageBase));
    }

    @Test
    void ignoresServerStorageWhenTheProviderIsNotLocal() {
        Path storageBase = tempDir.resolve("storage");
        FolderAccessGuard guard = guardWithStorage(List.of(), true, "s3", storageBase.toString());

        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(storageBase));
    }

    @Test
    void permitsPipelineWatchedFoldersEvenWithNoConfiguredRoots() {
        Path watched = tempDir.resolve("watched");
        FolderAccessGuard guard = guardWithWatchedFolder(watched.toString());
        Path within = watched.resolve("inbox");

        assertEquals(within.toAbsolutePath().normalize(), guard.requirePermitted(within));
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
