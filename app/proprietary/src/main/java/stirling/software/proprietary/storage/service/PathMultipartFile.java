package stirling.software.proprietary.storage.service;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
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
        this.path = path;
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

    @Override
    public byte[] getBytes() throws IOException {
        return Files.readAllBytes(path);
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return Files.newInputStream(path);
    }

    @Override
    public Resource getResource() {
        return new FileSystemResource(path);
    }

    @Override
    public void transferTo(File dest) throws IOException {
        // The caller owns the destination; this mirrors the MultipartFile contract.
        // lgtm[java/path-injection]
        Files.copy(path, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }
}
