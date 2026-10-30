package stirling.software.proprietary.storage.service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.util.FileCopyUtils;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.api.FileBackedMultipartFile;

/** A MultipartFile over a local file, avoiding a byte-array copy during storage ingest. */
public class PathMultipartFile implements MultipartFile, FileBackedMultipartFile {

    private final Path path;
    private final String originalFilename;
    private final String contentType;
    private final long size;

    public PathMultipartFile(Path path, String originalFilename, String contentType)
            throws IOException {
        Path normalized = path.toAbsolutePath().normalize();
        Path tempRoot =
                Paths.get(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
        if (!normalized.startsWith(tempRoot)) {
            throw new IllegalArgumentException("Path must be under the temp directory");
        }
        this.path = normalized;
        this.originalFilename = originalFilename;
        this.contentType =
                contentType != null ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE;
        this.size = Files.size(path);
    }

    @Override
    public String getName() {
        return "fileInput";
    }

    @Override
    public String getOriginalFilename() {
        return originalFilename;
    }

    @Override
    public String getContentType() {
        return contentType;
    }

    @Override
    public boolean isEmpty() {
        return size <= 0;
    }

    @Override
    public long getSize() {
        return size;
    }

    public Path getPath() {
        return path;
    }

    private Path safePath() {
        Path normalized = path.toAbsolutePath().normalize();
        Path tempRoot =
                Paths.get(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
        if (!normalized.startsWith(tempRoot)) {
            throw new IllegalStateException("Path must be under the temp directory");
        }
        return normalized;
    }

    @Override
    public byte[] getBytes() throws IOException {
        return Files.readAllBytes(safePath());
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return Files.newInputStream(safePath());
    }

    @Override
    public Resource getResource() {
        return new FileSystemResource(safePath());
    }

    @Override
    public void transferTo(File dest) throws IOException {
        // The caller owns the destination; this mirrors the MultipartFile contract.
        FileCopyUtils.copy(getBytes(), dest);
    }
}
