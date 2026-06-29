package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.api.CreateFolderRequest;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Unit tests for {@link FolderService}. Covers the regressions Connor flagged in PR #6383:
 *
 * <ul>
 *   <li>storage-enabled gate must be enforced (added in the same PR)
 *   <li>cross-user folder access must 404, not leak existence
 *   <li>cycle detection on reparent must 400
 *   <li>depth cap must reject chains past MAX_FOLDER_DEPTH
 *   <li>per-user folder count cap must 409
 * </ul>
 *
 * Hibernate is mocked: this is a pure-Mockito unit test, not a slice test. Adequate for the
 * service-layer behaviors above; full DB integration belongs in a separate {@code @DataJpaTest}.
 */
@ExtendWith(MockitoExtension.class)
class FolderServiceTest {

    @Mock private FolderRepository folderRepository;
    @Mock private StoredFileRepository storedFileRepository;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.Security security;
    @Mock private ApplicationProperties.Storage storage;

    private FolderService service;
    private User user;

    @BeforeEach
    void setUp() {
        // Default to "storage enabled" so the unrelated tests don't have to repeat the wiring.
        // Individual tests override with disabled state.
        lenient().when(applicationProperties.getSecurity()).thenReturn(security);
        lenient().when(applicationProperties.getStorage()).thenReturn(storage);
        lenient().when(security.isEnableLogin()).thenReturn(true);
        lenient().when(storage.isEnabled()).thenReturn(true);

        service = new FolderService(folderRepository, storedFileRepository, applicationProperties);

        user = new User();
        user.setId(42L);
        user.setUsername("alice");
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, java.util.List.of()));
        SecurityContextHolder.setContext(ctx);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listFolders_rejects_when_login_disabled() {
        when(security.isEnableLogin()).thenReturn(false);
        assertThatThrownBy(() -> service.listFolders())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(403));
    }

    @Test
    void listFolders_rejects_when_storage_disabled() {
        when(storage.isEnabled()).thenReturn(false);
        assertThatThrownBy(() -> service.listFolders())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(403));
    }

    @Test
    void createFolder_under_unknown_parent_returns_400_without_leaking_existence() {
        // Parent UUID exists for ANOTHER user; current-user lookup misses it. The repository
        // returns Optional.empty() and the service must surface a generic 400, not a 404 that
        // could be used to probe for existence by id-guessing.
        UUID foreignParentId = UUID.randomUUID();
        when(folderRepository.findByIdAndOwner(eq(foreignParentId), eq(user)))
                .thenReturn(Optional.empty());

        CreateFolderRequest req = new CreateFolderRequest();
        req.setName("Child");
        req.setParentFolderId(foreignParentId);

        assertThatThrownBy(() -> service.createFolder(req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e -> {
                            ResponseStatusException rse = (ResponseStatusException) e;
                            assertThat(rse.getStatusCode().value()).isEqualTo(400);
                            assertThat(rse.getReason()).doesNotContain(foreignParentId.toString());
                        });
    }

    @Test
    void createFolder_409_when_user_at_folder_cap() {
        // Stub out an existing-id miss so we reach the cap check (no Mockito unnecessary-stub
        // warnings from the OTHER paths because we exit at the cap before the existsById call).
        UUID newId = UUID.randomUUID();
        when(folderRepository.findByIdAndOwner(eq(newId), eq(user))).thenReturn(Optional.empty());
        when(folderRepository.existsById(eq(newId))).thenReturn(false);
        when(folderRepository.countByOwner(eq(user))).thenReturn(5_000L);

        CreateFolderRequest req = new CreateFolderRequest();
        req.setName("Overflow");
        req.setId(newId);

        assertThatThrownBy(() -> service.createFolder(req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(409));
    }

    @Test
    void resolveParent_rejects_when_chain_exceeds_depth_cap() {
        // Build a chain Hibernate-proxy-style: 64 ancestor stubs reachable via getParent(). The
        // 65th createFolder attempt under the deepest existing folder should be rejected with
        // 400 before any further work.
        Folder root = makeFolder(UUID.randomUUID(), null);
        Folder cursor = root;
        for (int i = 0; i < 63; i++) {
            Folder child = makeFolder(UUID.randomUUID(), cursor);
            cursor = child;
        }
        // cursor is at depth 64 from root. Attempting to add another folder under cursor pushes
        // the new child to depth 65 - past the cap. resolveParent walks cursor->root counting
        // ancestors, which is exactly 64, and rejects.
        Folder deepest = cursor;
        when(folderRepository.findByIdAndOwner(eq(deepest.getId()), eq(user)))
                .thenReturn(Optional.of(deepest));

        CreateFolderRequest req = new CreateFolderRequest();
        req.setName("Too deep");
        req.setParentFolderId(deepest.getId());

        assertThatThrownBy(() -> service.createFolder(req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e -> {
                            ResponseStatusException rse = (ResponseStatusException) e;
                            assertThat(rse.getStatusCode().value()).isEqualTo(400);
                            assertThat(rse.getReason()).containsIgnoringCase("nesting limit");
                        });
    }

    @Test
    void updateFolder_rejects_cycle_on_reparent() {
        // A -> B -> C. Attempt to reparent A under C (i.e. set A.parent = C). C's chain to root
        // includes B which includes A, so the cycle check must fire with 400.
        Folder a = makeFolder(UUID.randomUUID(), null);
        Folder b = makeFolder(UUID.randomUUID(), a);
        Folder c = makeFolder(UUID.randomUUID(), b);

        when(folderRepository.findByIdAndOwner(eq(a.getId()), eq(user))).thenReturn(Optional.of(a));
        when(folderRepository.findByIdAndOwner(eq(c.getId()), eq(user))).thenReturn(Optional.of(c));

        stirling.software.proprietary.storage.model.api.UpdateFolderRequest req =
                new stirling.software.proprietary.storage.model.api.UpdateFolderRequest();
        req.setParentFolderId(c.getId());
        // shouldReparent() requires the explicit reparent flag - without it the
        // parent change is silently skipped (PATCH-style semantics).
        req.setReparent(true);

        assertThatThrownBy(() -> service.updateFolder(a.getId(), req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e -> {
                            ResponseStatusException rse = (ResponseStatusException) e;
                            assertThat(rse.getStatusCode().value()).isEqualTo(400);
                            assertThat(rse.getReason()).containsIgnoringCase("descendants");
                        });
    }

    @Test
    void updateFolder_rejects_when_folder_not_owned() {
        // Owner mismatch surfaces as 404, NOT 403 - 403 would confirm the folder exists, leaking
        // ids to probing users. Stays consistent with the createFolder-under-unknown-parent test
        // above.
        UUID foreignId = UUID.randomUUID();
        when(folderRepository.findByIdAndOwner(eq(foreignId), eq(user)))
                .thenReturn(Optional.empty());

        stirling.software.proprietary.storage.model.api.UpdateFolderRequest req =
                new stirling.software.proprietary.storage.model.api.UpdateFolderRequest();
        req.setName("Renamed");

        assertThatThrownBy(() -> service.updateFolder(foreignId, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(404));
    }

    @Test
    void moveFileToFolder_rejects_when_target_folder_not_owned() {
        // File belongs to current user but target folder belongs to someone else. Service must
        // 400, not move the file.
        UUID foreignFolderId = UUID.randomUUID();
        stirling.software.proprietary.storage.model.StoredFile file =
                mock(stirling.software.proprietary.storage.model.StoredFile.class);
        when(storedFileRepository.findByIdAndOwner(eq(100L), eq(user)))
                .thenReturn(Optional.of(file));
        when(folderRepository.findByIdAndOwner(eq(foreignFolderId), eq(user)))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.moveFileToFolder(100L, foreignFolderId))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(400));
    }

    @Test
    void bulkMove_rejects_oversized_payload() {
        // Bypass the @Valid bound by calling the service directly - the cap must hold here too,
        // not just at the controller's request validator.
        java.util.List<Long> tooMany = new java.util.ArrayList<>();
        for (int i = 0; i < 1001; i++) tooMany.add((long) i);

        assertThatThrownBy(() -> service.bulkMoveFilesToFolder(null, tooMany))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        e ->
                                assertThat(((ResponseStatusException) e).getStatusCode().value())
                                        .isEqualTo(400));
    }

    @Test
    void bulkMove_returns_moved_and_skipped_split() {
        // Ownership filter on the repository returns a subset; the rest land in skippedFileIds.
        Folder target = makeFolder(UUID.randomUUID(), null);
        when(folderRepository.findByIdAndOwner(eq(target.getId()), eq(user)))
                .thenReturn(Optional.of(target));

        stirling.software.proprietary.storage.model.StoredFile fileA =
                mock(stirling.software.proprietary.storage.model.StoredFile.class);
        when(fileA.getId()).thenReturn(1L);
        stirling.software.proprietary.storage.model.StoredFile fileB =
                mock(stirling.software.proprietary.storage.model.StoredFile.class);
        when(fileB.getId()).thenReturn(2L);
        when(storedFileRepository.findAllByIdInAndOwner(any(), eq(user)))
                .thenReturn(java.util.List.of(fileA, fileB));

        FolderService.BulkMoveResult result =
                service.bulkMoveFilesToFolder(target.getId(), java.util.List.of(1L, 2L, 3L, 4L));

        assertThat(result.movedFileIds()).containsExactly(1L, 2L);
        assertThat(result.skippedFileIds()).containsExactly(3L, 4L);
    }

    // ─── helpers ────────────────────────────────────────────────────────────────

    private Folder makeFolder(UUID id, Folder parent) {
        Folder f = new Folder();
        f.setId(id);
        f.setOwner(user);
        f.setName("f-" + id.toString().substring(0, 8));
        f.setParent(parent);
        return f;
    }
}
