package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import jakarta.enterprise.inject.Instance;

import stirling.software.common.cluster.inprocess.LocalDiskFileStore;

class FileStorageDelegationTest {

    @Test
    @SuppressWarnings("unchecked")
    void storeBytesThenRetrieveBytesRoundTripsThroughFileStore(@TempDir Path tempDir)
            throws IOException {
        // FileStorage now takes a CDI Instance<JobOwnershipService> (was Optional). Mock one that
        // is
        // not resolvable, mirroring the previous Optional.empty() (desktop / no-security mode).
        Instance<JobOwnershipService> noOwnership = mock(Instance.class);
        when(noOwnership.isResolvable()).thenReturn(false);
        FileStorage fs =
                new FileStorage(
                        mock(FileOrUploadService.class),
                        new LocalDiskFileStore(tempDir.toString()),
                        noOwnership);
        byte[] payload = "round-trip".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }
}
