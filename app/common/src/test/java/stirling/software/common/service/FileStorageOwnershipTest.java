package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.util.JobContext;

class FileStorageOwnershipTest {

    private FileStorage newStorageWithoutSecurity(Path tempDir) {
        return new FileStorage(
                mock(FileOrUploadService.class),
                new LocalDiskFileStore(tempDir.toString()),
                Optional.empty());
    }

    private FileStorage newStorageWithCurrentUser(Path tempDir, AtomicReference<String> userRef) {
        JobOwnershipService svc = mock(JobOwnershipService.class);
        when(svc.getCurrentUserId()).thenAnswer(invocation -> Optional.ofNullable(userRef.get()));
        return new FileStorage(
                mock(FileOrUploadService.class),
                new LocalDiskFileStore(tempDir.toString()),
                Optional.of(svc));
    }

    @Test
    void desktopMode_noOwnershipService_storesAndRetrievesWithoutChecks(@TempDir Path tempDir)
            throws IOException {
        FileStorage fs = newStorageWithoutSecurity(tempDir);
        byte[] payload = "desktop".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }

    @Test
    void sameUserStoresAndRetrieves_allowed(@TempDir Path tempDir) throws IOException {
        AtomicReference<String> user = new AtomicReference<>("alice");
        FileStorage fs = newStorageWithCurrentUser(tempDir, user);
        byte[] payload = "alice's file".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }

    @Test
    void differentUserRetrieves_throwsSecurityException(@TempDir Path tempDir) throws IOException {
        AtomicReference<String> user = new AtomicReference<>("alice");
        FileStorage fs = newStorageWithCurrentUser(tempDir, user);
        String id = fs.storeBytes("alice's file".getBytes(), "x.bin");
        user.set("bob");
        assertThrows(SecurityException.class, () -> fs.retrieveBytes(id));
        assertThrows(SecurityException.class, () -> fs.retrieveInputStream(id));
        assertThrows(SecurityException.class, () -> fs.getFileSize(id));
        assertThrows(SecurityException.class, () -> fs.fileExists(id));
        assertThrows(SecurityException.class, () -> fs.deleteFile(id));
    }

    @Test
    void anonymousRetrieveOfOwnedFile_allowed_noCurrentUserMeansNoCompare(@TempDir Path tempDir)
            throws IOException {
        AtomicReference<String> user = new AtomicReference<>("alice");
        FileStorage fs = newStorageWithCurrentUser(tempDir, user);
        byte[] payload = "alice's file".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        user.set(null);
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }

    @Test
    void authedRetrieveOfAnonymousFile_allowed_noOwnerOnFile(@TempDir Path tempDir)
            throws IOException {
        AtomicReference<String> user = new AtomicReference<>(null);
        FileStorage fs = newStorageWithCurrentUser(tempDir, user);
        byte[] payload = "no-owner".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        user.set("alice");
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }

    @Test
    void propagatedOwner_scopesAsyncWriteWithNoLiveUser(@TempDir Path tempDir) throws IOException {
        AtomicReference<String> user = new AtomicReference<>(null);
        FileStorage fs = newStorageWithCurrentUser(tempDir, user);
        byte[] payload = "alice's async result".getBytes();
        String id;
        try {
            JobContext.setOwner("alice");
            id = fs.storeBytes(payload, "x.bin");
        } finally {
            JobContext.clear();
        }
        user.set("alice");
        assertArrayEquals(payload, fs.retrieveBytes(id));
        user.set("bob");
        assertThrows(SecurityException.class, () -> fs.retrieveBytes(id));
    }
}
