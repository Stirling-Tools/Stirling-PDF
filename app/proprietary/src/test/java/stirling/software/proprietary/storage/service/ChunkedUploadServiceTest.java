package stirling.software.proprietary.storage.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.api.ChunkedUploadResponse;
import stirling.software.proprietary.storage.model.api.CreateChunkedUploadRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;

class ChunkedUploadServiceTest {

    private static final int CHUNK = ChunkedUploadService.MIN_CHUNK_SIZE;

    private FileStorageService fileStorageService;
    private ChunkedUploadService service;
    private User owner;

    @BeforeEach
    void setUp() {
        fileStorageService = mock(FileStorageService.class);
        service = new ChunkedUploadService(fileStorageService);
        owner = new User();
        owner.setId(1L);
    }

    @Test
    void assemblesOutOfOrderChunksAndStoresTheTemporaryFile() throws Exception {
        long size = 2L * CHUNK + 1;
        ChunkedUploadResponse upload =
                service.create(
                        owner,
                        new CreateChunkedUploadRequest("doc.pdf", "application/pdf", size, CHUNK));
        AtomicReference<byte[]> storedBytes = new AtomicReference<>();
        when(fileStorageService.storeTemporaryFileResponse(
                        eq(owner), any(MultipartFile.class), any()))
                .thenAnswer(
                        invocation -> {
                            MultipartFile file = invocation.getArgument(1);
                            storedBytes.set(file.getBytes());
                            return StoredFileResponse.builder().id(5L).fileName("doc.pdf").build();
                        });

        byte[] first = filled('a', CHUNK);
        byte[] second = filled('b', CHUNK);
        byte[] last = {'z'};
        storeChunk(owner, upload.uploadId(), 2, last);
        storeChunk(owner, upload.uploadId(), 0, first);
        storeChunk(owner, upload.uploadId(), 1, second);

        StoredFileResponse response = service.complete(owner, upload.uploadId());

        assertThat(response.getId()).isEqualTo(5L);
        assertThat(storedBytes.get()).hasSize((int) size);
        assertThat(storedBytes.get()[0]).isEqualTo((byte) 'a');
        assertThat(storedBytes.get()[CHUNK]).isEqualTo((byte) 'b');
        assertThat(storedBytes.get()[(int) (2L * CHUNK)]).isEqualTo((byte) 'z');
    }

    @Test
    void rejectsMissingChunks() {
        ChunkedUploadResponse upload =
                service.create(
                        owner, new CreateChunkedUploadRequest("doc.pdf", null, 2L * CHUNK, CHUNK));
        storeChunk(owner, upload.uploadId(), 0, filled('a', CHUNK));

        assertThatThrownBy(() -> service.complete(owner, upload.uploadId()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsAnotherOwnersSession() {
        ChunkedUploadResponse upload =
                service.create(
                        owner, new CreateChunkedUploadRequest("doc.pdf", null, CHUNK, CHUNK));
        User other = new User();
        other.setId(2L);

        assertThatThrownBy(() -> storeChunk(other, upload.uploadId(), 0, new byte[CHUNK]))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void rejectsChunksOfTheWrongSize() {
        ChunkedUploadResponse upload =
                service.create(
                        owner, new CreateChunkedUploadRequest("doc.pdf", null, CHUNK, CHUNK));

        assertThatThrownBy(() -> storeChunk(owner, upload.uploadId(), 0, new byte[CHUNK - 1]))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsAnOversizedStreamWhenTheLengthIsUnknown() {
        ChunkedUploadResponse upload =
                service.create(
                        owner, new CreateChunkedUploadRequest("doc.pdf", null, CHUNK, CHUNK));

        byte[] tooLong = new byte[CHUNK + 1];
        assertThatThrownBy(
                        () ->
                                service.storeChunk(
                                        owner,
                                        upload.uploadId(),
                                        0,
                                        new ByteArrayInputStream(tooLong),
                                        -1))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(error -> ((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONTENT_TOO_LARGE);
    }

    private static byte[] filled(char value, int size) {
        byte[] bytes = new byte[size];
        Arrays.fill(bytes, (byte) value);
        return bytes;
    }

    private void storeChunk(User owner, UUID uploadId, int index, byte[] data) {
        service.storeChunk(owner, uploadId, index, new ByteArrayInputStream(data), data.length);
    }
}
