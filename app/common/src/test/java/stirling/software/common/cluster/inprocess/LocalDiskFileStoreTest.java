package stirling.software.common.cluster.inprocess;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.cluster.FileStore;

class LocalDiskFileStoreTest {

    @Test
    void storeRetrieveSizeDeleteExistsRoundTrip(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        byte[] payload = "hello-bytes".getBytes();

        FileStore.Stored stored = store.store(new ByteArrayInputStream(payload), "x.txt");
        assertEquals(payload.length, stored.size());
        assertTrue(store.exists(stored.fileId()));
        assertEquals(payload.length, store.size(stored.fileId()));
        assertArrayEquals(payload, store.retrieveBytes(stored.fileId()));

        assertTrue(store.delete(stored.fileId()));
        assertFalse(store.exists(stored.fileId()));
    }

    @Test
    void traversalIdsAreRejected(@TempDir Path dir) {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        assertThrows(IllegalArgumentException.class, () -> store.resolve("../foo"));
        assertThrows(IllegalArgumentException.class, () -> store.resolve("a/b"));
        assertThrows(IllegalArgumentException.class, () -> store.resolve("a\\b"));
    }

    @Test
    void ownerSidecarCannotBeReadAsFileId(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        FileStore.Stored stored =
                store.store(new ByteArrayInputStream("hi".getBytes()), "f.bin", "alice");
        String sidecarId = stored.fileId() + ".owner";
        assertThrows(IllegalArgumentException.class, () -> store.resolve(sidecarId));
        assertThrows(IllegalArgumentException.class, () -> store.retrieveBytes(sidecarId));
    }

    @Test
    void ownerIsPersistedAndReturnedByGetOwner(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        FileStore.Stored stored =
                store.store(new ByteArrayInputStream("hi".getBytes()), "f.bin", "alice");
        assertEquals("alice", store.getOwner(stored.fileId()));
    }

    @Test
    void getOwnerReturnsNullWhenNoOwnerWasRecorded(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        FileStore.Stored stored =
                store.store(new ByteArrayInputStream("hi".getBytes()), "f.bin", null);
        assertNull(store.getOwner(stored.fileId()));
    }

    @Test
    void getOwnerReturnsNullForUnknownFileId(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        assertNull(store.getOwner("00000000-0000-0000-0000-000000000000"));
    }

    @Test
    void deleteRemovesOwnerSidecar(@TempDir Path dir) throws IOException {
        LocalDiskFileStore store = new LocalDiskFileStore(dir.toString());
        FileStore.Stored stored =
                store.store(new ByteArrayInputStream("hi".getBytes()), "f.bin", "alice");
        assertTrue(store.delete(stored.fileId()));
        assertFalse(Files.exists(dir.resolve(stored.fileId() + ".owner")));
        assertNull(store.getOwner(stored.fileId()));
    }
}
