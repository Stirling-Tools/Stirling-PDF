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
import stirling.software.proprietary.policy.model.Policy;

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
        assertThrows(
                IllegalArgumentException.class,
                () -> guard.requirePermitted(tempDir.resolveSibling("elsewhere")));
    }

    @Test
    void rejectsTraversalThatWalksOutOfAnAllowedRoot() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()));
        assertThrows(
                IllegalArgumentException.class,
                () -> guard.requirePermitted(tempDir.resolve("..").resolve("escaped")));
    }

    @Test
    void rejectsEverythingWhenNoRootsAreConfigured() {
        FolderAccessGuard guard = guard(List.of());
        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(tempDir));
    }

    @Test
    void rejectsTheStirlingConfigDirectoryEvenWhenItWouldBeInsideAnAllowedRoot() {
        Path configDir =
                Path.of(InstallationPathConfig.getConfigPath()).toAbsolutePath().normalize();
        // Allow the config dir's parent, so only the protected-path rule can reject it.
        FolderAccessGuard guard = guard(List.of(configDir.getParent().toString()));

        assertThrows(
                IllegalArgumentException.class,
                () -> guard.requirePermitted(configDir.resolve("settings.yml")));
    }

    @Test
    void refusesAllFolderAccessUnderTheSaasProfile() {
        FolderAccessGuard guard = guard(List.of(tempDir.toString()), "saas");
        assertThrows(IllegalArgumentException.class, () -> guard.requirePermitted(tempDir));
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

    private static Policy policy(List<InputSpec> sources, OutputSpec output) {
        return new Policy("p1", "p", "owner", true, null, sources, List.of(), output);
    }
}
