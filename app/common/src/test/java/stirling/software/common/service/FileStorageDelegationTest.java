package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.cluster.inprocess.LocalDiskFileStore;

class FileStorageDelegationTest {

    @Test
    void storeBytesThenRetrieveBytesRoundTripsThroughFileStore(@TempDir Path tempDir)
            throws IOException {
        FileStorage fs =
                new FileStorage(
                        mock(FileOrUploadService.class),
                        new LocalDiskFileStore(tempDir.toString()),
                        Optional.empty());
        byte[] payload = "round-trip".getBytes();
        String id = fs.storeBytes(payload, "x.bin");
        assertArrayEquals(payload, fs.retrieveBytes(id));
    }
}
