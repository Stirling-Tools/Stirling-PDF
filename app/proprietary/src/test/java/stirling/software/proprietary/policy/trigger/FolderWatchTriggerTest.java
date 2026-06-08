package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.WatchService;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Tests for {@link FolderWatchTrigger}'s dispatch logic via the package-visible {@code
 * runForChangedDirs}/{@code runAll}, plus its cross-facet validation. The OS watch loop and
 * scheduled reconcile are thin glue around these and are not exercised here (a real {@code
 * WatchService} is timing-dependent), mirroring how {@link ScheduleTriggerTest} drives {@code
 * sweep} directly. The folder source is stubbed to mirror {@code FolderInputSource.watchTargets}.
 */
@ExtendWith(MockitoExtension.class)
class FolderWatchTriggerTest {

    @Mock private PolicyStore policyStore;
    @Mock private PolicyRunner policyRunner;
    @Mock private InputSource folderSource;

    @TempDir Path tempDir;

    private FolderWatchTrigger trigger;

    @BeforeEach
    void setUp() {
        trigger = new FolderWatchTrigger(policyStore, policyRunner, List.of(folderSource));
        lenient().when(folderSource.supports(any())).thenReturn(true);
        lenient()
                .when(folderSource.watchTargets(any()))
                .thenAnswer(
                        invocation -> {
                            InputSpec spec = invocation.getArgument(0);
                            Object dir = spec.options().get("directory");
                            if (dir == null) {
                                throw new IllegalArgumentException(
                                        "folder input requires a 'directory' option");
                            }
                            return List.of(Path.of(dir.toString()));
                        });
    }

    @Test
    void validateRejectsPolicyWithNoWatchableSource() {
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(folderWatch("p1", List.of())));
    }

    @Test
    void validateAcceptsPolicyWithAFolderSource() {
        trigger.validate(folderWatch("p1", List.of(InputSpec.folder("/in"))));
    }

    @Test
    void runsOnlyPoliciesDrawingFromTheChangedDirectory() {
        Policy a = folderWatch("a", List.of(InputSpec.folder("/in/a")));
        Policy b = folderWatch("b", List.of(InputSpec.folder("/in/b")));
        when(policyStore.findByTriggerType("folder-watch")).thenReturn(List.of(a, b));

        trigger.runForChangedDirs(Set.of(normalized("/in/a")));

        verify(policyRunner).run(a);
        verify(policyRunner, never()).run(b);
    }

    @Test
    void skipsAMisconfiguredPolicyButStillRunsTheOthers() {
        Policy bad = folderWatch("bad", List.of(new InputSpec("folder", Map.of())));
        Policy good = folderWatch("good", List.of(InputSpec.folder("/in/a")));
        when(policyStore.findByTriggerType("folder-watch")).thenReturn(List.of(bad, good));

        trigger.runForChangedDirs(Set.of(normalized("/in/a")));

        verify(policyRunner).run(good);
        verify(policyRunner, never()).run(bad);
    }

    @Test
    void anEmptyChangeSetDoesNothing() {
        trigger.runForChangedDirs(Set.of());

        verifyNoInteractions(policyStore, policyRunner);
    }

    @Test
    void reconcileRunsEveryFolderWatchPolicyAsASafetyNet() {
        Policy a = folderWatch("a", List.of(InputSpec.folder("/in/a")));
        Policy b = folderWatch("b", List.of(InputSpec.folder("/in/b")));
        when(policyStore.findByTriggerType("folder-watch")).thenReturn(List.of(a, b));

        trigger.runAll();

        verify(policyRunner).run(a);
        verify(policyRunner).run(b);
    }

    @Test
    void syncRegistrationsWatchesExistingDirsAndCancelsRemovedOnes() throws Exception {
        Path dirA = Files.createDirectories(tempDir.resolve("a"));
        Path dirB = Files.createDirectories(tempDir.resolve("b"));
        Path missing = tempDir.resolve("missing"); // never created on disk

        Policy a = folderWatch("a", List.of(InputSpec.folder(dirA.toString())));
        Policy b = folderWatch("b", List.of(InputSpec.folder(dirB.toString())));
        Policy m = folderWatch("m", List.of(InputSpec.folder(missing.toString())));

        WatchService service = FileSystems.getDefault().newWatchService();
        try {
            trigger.watchService = service;

            when(policyStore.findByTriggerType("folder-watch")).thenReturn(List.of(a, b, m));
            trigger.syncRegistrations();
            // Existing dirs are watched; the non-existent one is skipped.
            assertEquals(
                    Set.of(normalized(dirA.toString()), normalized(dirB.toString())),
                    trigger.watchedDirs());

            // b's policy is removed: its registration is cancelled, a remains.
            when(policyStore.findByTriggerType("folder-watch")).thenReturn(List.of(a));
            trigger.syncRegistrations();
            assertEquals(Set.of(normalized(dirA.toString())), trigger.watchedDirs());
        } finally {
            service.close();
        }
    }

    private static Path normalized(String dir) {
        return Path.of(dir).toAbsolutePath().normalize();
    }

    private static Policy folderWatch(String id, List<InputSpec> sources) {
        return new Policy(
                id,
                "watcher",
                "owner",
                true,
                new TriggerConfig("folder-watch", Map.of()),
                sources,
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}
