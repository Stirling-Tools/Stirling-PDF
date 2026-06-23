package stirling.software.common.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.service.FileStorage.StoredFile;

class FileStorageMoreTest {

    @TempDir Path storageDir;

    private FileStorage fileStorage;

    @BeforeEach
    void setUp() {
        fileStorage =
                new FileStorage(
                        mock(FileOrUploadService.class),
                        new LocalDiskFileStore(storageDir.toString()),
                        Optional.empty());
    }

    @Nested
    @DisplayName("storeInputStream / getFileSize / retrieveInputStream")
    class StreamAndSize {

        @Test
        @DisplayName("storeInputStream returns id and exact byte size")
        void storeInputStreamReturnsSize() throws IOException {
            byte[] payload = "twelve bytes".getBytes(StandardCharsets.UTF_8);
            StoredFile stored =
                    fileStorage.storeInputStream(new ByteArrayInputStream(payload), "in.bin");
            assertThat(stored.fileId()).isNotBlank();
            assertThat(stored.size()).isEqualTo(payload.length);
            assertThat(fileStorage.getFileSize(stored.fileId())).isEqualTo(payload.length);
        }

        @Test
        @DisplayName("retrieveInputStream yields the stored content")
        void retrieveInputStreamContent() throws IOException {
            byte[] payload = "stream-me".getBytes(StandardCharsets.UTF_8);
            String id = fileStorage.storeBytes(payload, "s.bin");
            try (InputStream in = fileStorage.retrieveInputStream(id)) {
                assertThat(in.readAllBytes()).isEqualTo(payload);
            }
        }
    }

    @Nested
    @DisplayName("storeFile fast path")
    class FastPath {

        @Test
        @DisplayName("file-backed MultipartFile is stored via the Resource fast path")
        void fileBackedResourceStored(@TempDir Path src) throws IOException {
            byte[] payload = "file-backed-content".getBytes(StandardCharsets.UTF_8);
            Path onDisk = Files.write(src.resolve("upload.pdf"), payload);

            // A MultipartFile whose getResource() reports isFile()=true exercises the
            // file-to-file copy branch in storeFile.
            MultipartFile multipart =
                    new MockMultipartFile(
                            "file", "upload.pdf", MediaType.APPLICATION_PDF_VALUE, payload) {
                        @Override
                        public org.springframework.core.io.Resource getResource() {
                            return new FileSystemResource(onDisk);
                        }
                    };

            String id = fileStorage.storeFile(multipart);
            assertThat(id).isNotBlank();
            assertThat(fileStorage.retrieveBytes(id)).isEqualTo(payload);
        }

        @Test
        @DisplayName("in-memory MultipartFile falls back to the stream copy path")
        void inMemoryFallback() throws IOException {
            byte[] payload = "memory-content".getBytes(StandardCharsets.UTF_8);
            MultipartFile multipart =
                    new MockMultipartFile(
                            "file", "m.pdf", MediaType.APPLICATION_PDF_VALUE, payload);
            String id = fileStorage.storeFile(multipart);
            assertThat(fileStorage.retrieveBytes(id)).isEqualTo(payload);
        }
    }

    @Nested
    @DisplayName("storeFromStreamingBody")
    class StreamingBody {

        @Test
        @DisplayName("happy path streams body to storage")
        void happyPath() throws IOException {
            byte[] payload = "streamed-body-bytes".getBytes(StandardCharsets.UTF_8);
            StreamingResponseBody body = out -> out.write(payload);
            String id = fileStorage.storeFromStreamingBody(body, "body.bin");
            assertThat(fileStorage.retrieveBytes(id)).isEqualTo(payload);
        }

        @Test
        @DisplayName("writer IOException propagates and leaves no lingering file")
        void writerErrorPropagatesAndCleansUp() throws IOException {
            long before = countFiles();
            StreamingResponseBody body =
                    out -> {
                        out.write("partial".getBytes(StandardCharsets.UTF_8));
                        throw new IOException("boom mid-write");
                    };
            assertThatThrownBy(() -> fileStorage.storeFromStreamingBody(body, "bad.bin"))
                    .isInstanceOf(IOException.class);
            assertThat(countFiles()).isEqualTo(before);
        }

        @Test
        @DisplayName("unchecked writer failure is wrapped as IOException")
        void uncheckedWriterErrorWrapped() {
            StreamingResponseBody body =
                    out -> {
                        throw new IllegalStateException("unchecked boom");
                    };
            assertThatThrownBy(() -> fileStorage.storeFromStreamingBody(body, "bad2.bin"))
                    .isInstanceOf(IOException.class);
        }

        private long countFiles() throws IOException {
            try (var s = Files.list(storageDir)) {
                return s.count();
            }
        }
    }
}
