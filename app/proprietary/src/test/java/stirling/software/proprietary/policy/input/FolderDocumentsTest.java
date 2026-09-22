package stirling.software.proprietary.policy.input;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;

/**
 * {@link FolderDocuments} stops a ledger identity naming a file its presser has no claim on, so the
 * cases that matter are the ones where the identity is not what the policy's own folders hold.
 */
@ExtendWith(MockitoExtension.class)
class FolderDocumentsTest {

    private static final String SOURCE_ID = "source-1";

    @Mock private SourceStore sourceStore;
    @Mock private FolderAccessGuard accessGuard;

    @TempDir private Path watched;
    @TempDir private Path elsewhere;

    private FolderDocuments documents;

    @BeforeEach
    void setUp() {
        documents = new FolderDocuments(sourceStore, accessGuard);
        lenient()
                .when(sourceStore.get(SOURCE_ID))
                .thenReturn(
                        Optional.of(
                                new Source(
                                        SOURCE_ID,
                                        "Downloads",
                                        FolderAccessGuard.FOLDER_TYPE,
                                        Map.of("directory", watched.toString()),
                                        true,
                                        "carol",
                                        3L)));
        // Stands in for the installation's own allowlist, which is checked separately.
        lenient()
                .when(accessGuard.requirePermitted(any(Path.class)))
                .thenAnswer(call -> call.getArgument(0, Path.class).toAbsolutePath().normalize());
    }

    private Policy policy() {
        return new Policy(
                "policy-folder-1",
                "Downloads",
                "carol",
                true,
                false,
                "",
                List.of(PipelineInput.manual(SOURCE_ID)),
                List.of(),
                OutputSpec.inline(),
                List.of(),
                3L,
                null,
                Policy.SURFACE_PROCESSING_FOLDER,
                List.of());
    }

    private Path file(Path dir, String name) throws IOException {
        Path created = dir.resolve(name);
        Files.createDirectories(created.getParent());
        Files.writeString(created, "%PDF-1.4");
        return created;
    }

    @Test
    void findsAFileInTheFolderThePolicyWatches() throws IOException {
        Path invoice = file(watched, "invoice.pdf");

        // Canonical, so it agrees with the root it was checked against however the two were
        // spelled: on macOS the temp dir is reached through a symlinked /var.
        assertThat(documents.locate(policy(), invoice.toString())).contains(invoice.toRealPath());
    }

    @Test
    void findsAFileInASubdirectoryOfIt() throws IOException {
        // A recursive folder source claims these too, so they must stay addressable.
        Path invoice = file(watched, "2026/invoice.pdf");

        assertThat(documents.locate(policy(), invoice.toString())).isPresent();
    }

    @Test
    void refusesAFileInSomebodyElsesFolder() throws IOException {
        // The whole point: an identity is trusted to name a document, never to name a location.
        Path theirs = file(elsewhere, "salaries.pdf");

        assertThat(documents.locate(policy(), theirs.toString())).isEmpty();
    }

    @Test
    void refusesAPathThatClimbsOutOfTheWatchedFolder() throws IOException {
        file(elsewhere, "salaries.pdf");
        String escaping =
                watched.resolve("../").resolve(elsewhere.getFileName()).toString()
                        + "/salaries.pdf";

        assertThat(documents.locate(policy(), escaping)).isEmpty();
    }

    @Test
    void refusesTheArchivedOriginalsUnderTheWorkspaceDir() throws IOException {
        // Applying a fix to the copy kept in order to undo one would destroy the way back.
        Path archived = file(watched, ".stirling/originals/invoice.pdf");

        assertThat(documents.locate(policy(), archived.toString())).isEmpty();
    }

    @Test
    void refusesADirectory() {
        assertThat(documents.locate(policy(), watched.toString())).isEmpty();
    }

    @Test
    void refusesAFileThatIsNoLongerThere() {
        assertThat(documents.locate(policy(), watched.resolve("gone.pdf").toString())).isEmpty();
    }

    @Test
    void refusesWhenTheFolderIsNoLongerPermitted() throws IOException {
        // The allowlist can be narrowed after a row was recorded, and that must take effect here
        // rather than only on the next sweep.
        Path invoice = file(watched, "invoice.pdf");
        when(accessGuard.requirePermitted(any(Path.class)))
                .thenThrow(new IllegalArgumentException("outside the allowed folder roots"));

        assertThat(documents.locate(policy(), invoice.toString())).isEmpty();
    }

    @Test
    void refusesWhenThePolicyWatchesNoFolderAtAll() throws IOException {
        Path invoice = file(watched, "invoice.pdf");
        when(sourceStore.get(SOURCE_ID))
                .thenReturn(
                        Optional.of(
                                new Source(
                                        SOURCE_ID,
                                        "Bucket",
                                        "s3",
                                        Map.of("bucket", "documents"),
                                        true,
                                        "carol",
                                        3L)));

        assertThat(documents.locate(policy(), invoice.toString())).isEmpty();
    }

    @Test
    void refusesABlankIdentity() {
        assertThat(documents.locate(policy(), " ")).isEmpty();
        assertThat(documents.locate(policy(), null)).isEmpty();
    }
}
