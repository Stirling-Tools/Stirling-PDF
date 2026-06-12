package stirling.software.common.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.*;

import jakarta.enterprise.context.ApplicationScoped;

import org.eclipse.microprofile.config.inject.ConfigProperty;

// TODO: Migration required - org.springframework.web.multipart.MultipartFile has no
// JAX-RS/servlet drop-in. It is used as a public method return type and implemented by the
// inner CustomMultipartFile class; converting the type would ripple to all callers. Keeping
// the Spring type for now to preserve the public signature and behavior.
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

@ApplicationScoped
@RequiredArgsConstructor
public class FileOrUploadService {

    @ConfigProperty(name = "stirling.tempDir", defaultValue = "/tmp/stirling-files")
    String tempDirPath;

    public Path resolveFilePath(String fileId) {
        return Path.of(tempDirPath).resolve(fileId);
    }

    public MultipartFile toMockMultipartFile(String name, byte[] data) throws IOException {
        return new CustomMultipartFile(name, data);
    }

    // Custom implementation of MultipartFile
    private static class CustomMultipartFile implements MultipartFile {
        private final String name;
        private final byte[] content;

        public CustomMultipartFile(String name, byte[] content) {
            this.name = name;
            this.content = content;
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
            return content == null || content.length == 0;
        }

        @Override
        public long getSize() {
            return content.length;
        }

        @Override
        public byte[] getBytes() throws IOException {
            return content;
        }

        @Override
        public java.io.InputStream getInputStream() throws IOException {
            return new ByteArrayInputStream(content);
        }

        @Override
        public void transferTo(java.io.File dest) throws IOException, IllegalStateException {
            Files.write(dest.toPath(), content);
        }
    }
}
