package stirling.software.common.service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class FileOrUploadService {

    @Value("${stirling.tempDir:/tmp/stirling-files}")
    private String tempDirPath;

    public Path resolveFilePath(String fileId) {
        return Path.of(tempDirPath).resolve(fileId);
    }

    /** Opens a fresh stream over the stored content on each call. */
    @FunctionalInterface
    public interface ContentSource {
        InputStream open() throws IOException;
    }

    /**
     * Wraps stored content as a MultipartFile that reads it on demand, so large stored files reach
     * consumers as a stream rather than being loaded into the heap up front.
     */
    public MultipartFile toStreamingMultipartFile(String name, long size, ContentSource source) {
        return new StreamingMultipartFile(name, size, source);
    }

    private static class StreamingMultipartFile implements MultipartFile {
        private final String name;
        private final long size;
        private final ContentSource source;

        StreamingMultipartFile(String name, long size, ContentSource source) {
            this.name = name;
            this.size = size;
            this.source = source;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public String getOriginalFilename() {
            return name;
        }

        @Override
        public String getContentType() {
            return "application/pdf";
        }

        @Override
        public boolean isEmpty() {
            return size == 0;
        }

        @Override
        public long getSize() {
            return size;
        }

        @Override
        public byte[] getBytes() throws IOException {
            try (InputStream in = source.open()) {
                return in.readAllBytes();
            }
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return source.open();
        }

        @Override
        public void transferTo(File dest) throws IOException, IllegalStateException {
            try (InputStream in = source.open()) {
                Files.copy(in, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }
}
