package stirling.software.proprietary.storage.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

class StorageExpiryPurgerTest {

    private final StoredFileRepository repo = mock(StoredFileRepository.class);
    private final FileStorageService service = mock(FileStorageService.class);
    private final ApplicationProperties props = new ApplicationProperties();
    private final StorageExpiryPurger purger = new StorageExpiryPurger(repo, service, props);

    private static StoredFile file(long id, User owner) {
        StoredFile f = new StoredFile();
        f.setId(id);
        f.setOwner(owner);
        return f;
    }

    @Test
    void failingFileDoesNotStopLaterBatches() {
        props.getStorage().setEnabled(true);
        User owner = new User();
        StoredFile stuck = file(1, owner);
        StoredFile next = file(2, owner);
        when(repo.findExpiredAfterId(any(), eq(0L), any())).thenReturn(List.of(stuck));
        when(repo.findExpiredAfterId(any(), eq(1L), any())).thenReturn(List.of(next));
        when(repo.findExpiredAfterId(any(), eq(2L), any())).thenReturn(List.of());
        doThrow(new IllegalStateException("blob gone")).when(service).deleteFile(owner, stuck);

        purger.purgeExpiredFiles();

        verify(service).deleteFile(owner, next);
    }

    @Test
    void storageDisabled_doesNothing() {
        props.getStorage().setEnabled(false);

        purger.purgeExpiredFiles();

        verify(repo, never()).findExpiredAfterId(any(), anyLong(), any());
    }
}
