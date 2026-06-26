package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * Tests for {@link FolderAccessGuard}: folder access is fail-closed, confined to the configured
 * allowed roots, never reaches Stirling's own config directory, and is off entirely under SaaS.
 */
class FolderAccessGuardTest {

    @TempDir Path tempDir;

    private final SourceStore sourceStore = new InProcessSourceStore();

    private FolderAccessGuard guard(List<String> allowedRoots, String... activeProfiles) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getPolicies().setAllowedFolderRoots(allowedRoots);
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles(activeProfiles);
        return new FolderAccessGuard(properties, environment, sourceStore);
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
        return new Policy("p1", "p", "owner", true, null, sourceIds, List.of(), output);
    }
}
