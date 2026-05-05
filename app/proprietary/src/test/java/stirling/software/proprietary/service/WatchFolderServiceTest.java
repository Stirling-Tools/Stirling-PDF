package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;

import stirling.software.proprietary.model.WatchFolder;
import stirling.software.proprietary.model.watchfolder.FolderScope;
import stirling.software.proprietary.repository.WatchFolderFileRepository;
import stirling.software.proprietary.repository.WatchFolderRepository;
import stirling.software.proprietary.repository.WatchFolderRunRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WatchFolderServiceTest {

    private static final String FOLDER_ID = "folder-1";
    private static final String OTHER_FOLDER_ID = "folder-2";
    private static final String FILE_ID = "file-abc";
    private static final String OWNER_USERNAME = "alice";
    private static final String OTHER_USERNAME = "bob";

    @Mock private WatchFolderRepository folderRepo;
    @Mock private WatchFolderFileRepository fileRepo;
    @Mock private WatchFolderRunRepository runRepo;
    @Mock private UserRepository userRepo;
    @Mock private UserService userService;

    @InjectMocks private WatchFolderService service;

    private User owner;
    private User other;
    private WatchFolder personalFolder;
    private WatchFolder organisationFolder;

    @BeforeEach
    void setUp() {
        owner = new User();
        owner.setId(1L);
        owner.setUsername(OWNER_USERNAME);

        other = new User();
        other.setId(2L);
        other.setUsername(OTHER_USERNAME);

        personalFolder = new WatchFolder();
        personalFolder.setId(FOLDER_ID);
        personalFolder.setName("Personal Folder");
        personalFolder.setScope(FolderScope.PERSONAL);
        personalFolder.setOwner(owner);

        organisationFolder = new WatchFolder();
        organisationFolder.setId(FOLDER_ID);
        organisationFolder.setName("Org Folder");
        organisationFolder.setScope(FolderScope.ORGANISATION);
        organisationFolder.setOwner(null);
    }

    /** Convenience: stub current user lookup to return {@code user}. */
    private void asUser(User user) {
        if (user == null) {
            when(userService.getCurrentUsername()).thenReturn(null);
            return;
        }
        when(userService.getCurrentUsername()).thenReturn(user.getUsername());
        when(userRepo.findByUsernameIgnoreCase(user.getUsername())).thenReturn(Optional.of(user));
    }

    // ── deleteFile ─────────────────────────────────────────────────────────

    @Test
    void deleteFile_returnsTrue_whenRowExistsAndOwnedByCurrentUser() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(fileRepo.deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID)).thenReturn(1);

        boolean result = service.deleteFile(FOLDER_ID, FILE_ID);

        assertTrue(result, "deleteFile should return true when a row was deleted");
        verify(fileRepo, times(1)).deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID);
    }

    @Test
    void deleteFile_returnsFalse_whenFileIdNotInFolder() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(fileRepo.deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID)).thenReturn(0);

        boolean result = service.deleteFile(FOLDER_ID, FILE_ID);

        assertFalse(result, "deleteFile should return false when no row was deleted");
        verify(fileRepo, times(1)).deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID);
    }

    @Test
    void deleteFile_isIdempotent_secondCallReturnsFalse() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(fileRepo.deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID)).thenReturn(1, 0);

        boolean first = service.deleteFile(FOLDER_ID, FILE_ID);
        boolean second = service.deleteFile(FOLDER_ID, FILE_ID);

        assertTrue(first, "First call should return true (row deleted)");
        assertFalse(second, "Second call should return false (already gone) without error");
        verify(fileRepo, times(2)).deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID);
    }

    @Test
    void deleteFile_throwsAccessDenied_whenNotOwnerOfPersonalFolder() {
        asUser(other);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.deleteFile(FOLDER_ID, FILE_ID));
        verify(fileRepo, never()).deleteByFolderIdAndFileId(any(), any());
    }

    @Test
    void deleteFile_throwsAccessDenied_whenNonAdminAndOrganisationScope() {
        asUser(other);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(organisationFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.deleteFile(FOLDER_ID, FILE_ID));
        verify(fileRepo, never()).deleteByFolderIdAndFileId(any(), any());
    }

    @Test
    void deleteFile_succeedsForOrganisationFolder_whenCurrentUserIsAdmin() {
        asUser(other); // any logged-in user, but admin-flagged
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(organisationFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        when(fileRepo.deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID)).thenReturn(1);

        boolean result = service.deleteFile(FOLDER_ID, FILE_ID);

        assertTrue(result, "Admin should be able to delete from an ORGANISATION folder");
        verify(fileRepo, times(1)).deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID);
    }

    @Test
    void deleteFile_doesNotDeleteFromOtherFolders() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(fileRepo.deleteByFolderIdAndFileId(FOLDER_ID, FILE_ID)).thenReturn(1);

        service.deleteFile(FOLDER_ID, FILE_ID);

        // Folder isolation: the bulk delete must be scoped to FOLDER_ID — never invoked against
        // another folder id.
        verify(fileRepo, times(1)).deleteByFolderIdAndFileId(eq(FOLDER_ID), eq(FILE_ID));
        verify(fileRepo, never()).deleteByFolderIdAndFileId(eq(OTHER_FOLDER_ID), any());
    }

    @Test
    void deleteFile_throwsIllegalArgument_whenFolderDoesNotExist() {
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class, () -> service.deleteFile(FOLDER_ID, FILE_ID));
        verify(fileRepo, never()).deleteByFolderIdAndFileId(any(), any());
    }

    // ── deleteRuns ─────────────────────────────────────────────────────────

    @Test
    void deleteRuns_removesAllRunsForFolder_andLeavesOtherFoldersIntact() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(runRepo.deleteAllByFolderId(FOLDER_ID)).thenReturn(3);

        service.deleteRuns(FOLDER_ID);

        // Scoped to the requested folder only.
        verify(runRepo, times(1)).deleteAllByFolderId(FOLDER_ID);
        verify(runRepo, never()).deleteAllByFolderId(OTHER_FOLDER_ID);
    }

    @Test
    void deleteRuns_isNoop_whenNoRunsExist() {
        asUser(owner);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(runRepo.deleteAllByFolderId(FOLDER_ID)).thenReturn(0);

        // Should not throw.
        service.deleteRuns(FOLDER_ID);

        verify(runRepo, times(1)).deleteAllByFolderId(FOLDER_ID);
    }

    @Test
    void deleteRuns_throwsAccessDenied_whenNotOwnerOfPersonalFolder() {
        asUser(other);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(personalFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.deleteRuns(FOLDER_ID));
        verify(runRepo, never()).deleteAllByFolderId(any());
    }

    @Test
    void deleteRuns_throwsAccessDenied_whenNonAdminAndOrganisationScope() {
        asUser(other);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(organisationFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(false);

        assertThrows(AccessDeniedException.class, () -> service.deleteRuns(FOLDER_ID));
        verify(runRepo, never()).deleteAllByFolderId(any());
    }

    @Test
    void deleteRuns_succeedsForOrganisationFolder_whenCurrentUserIsAdmin() {
        asUser(other);
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.of(organisationFolder));
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        when(runRepo.deleteAllByFolderId(FOLDER_ID)).thenReturn(2);

        service.deleteRuns(FOLDER_ID);

        verify(runRepo, times(1)).deleteAllByFolderId(FOLDER_ID);
    }

    @Test
    void deleteRuns_throwsIllegalArgument_whenFolderDoesNotExist() {
        when(folderRepo.findById(FOLDER_ID)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class, () -> service.deleteRuns(FOLDER_ID));
        verify(runRepo, never()).deleteAllByFolderId(any());
    }
}
