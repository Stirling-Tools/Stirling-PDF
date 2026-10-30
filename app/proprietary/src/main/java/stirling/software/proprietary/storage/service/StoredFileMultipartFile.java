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

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.api.FileBackedMultipartFile;
import stirling.software.proprietary.storage.model.StoredFile;

/** Exposes a stored file as a MultipartFile; each read opens a fresh stream. */
@RequiredArgsConstructor
public class StoredFileMultipartFile implements MultipartFile, FileBackedMultipartFile {

    private final FileStorageService fileStorageService;
    private final StoredFile storedFile;

    @Override
    public String getName() {
        return "fileInput";
    }

    @Override
    public String getOriginalFilename() {
        return storedFile.getOriginalFilename();
    }

    @Override
    public String getContentType() {
        String contentType = storedFile.getContentType();
        return contentType != null ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }

    @Override
    public boolean isEmpty() {
        return storedFile.getSizeBytes() <= 0;
    }

    @Override
    public long getSize() {
        return storedFile.getSizeBytes();
    }

    @Override
    public byte[] getBytes() throws IOException {
        try (InputStream inputStream = getInputStream()) {
            return inputStream.readAllBytes();
        }
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return fileStorageService.loadFile(storedFile).getInputStream();
    }

    @Override
    public Path getPath() throws IOException {
        Resource resource = fileStorageService.loadFile(storedFile);
        return resource.isFile() ? resource.getFile().toPath() : null;
    }

    /** Returns a local file when available, so PDF loaders can random-access without a copy. */
    @Override
    public Resource getResource() {
        try {
            Resource resource = fileStorageService.loadFile(storedFile);
            if (resource instanceof FileSystemResource) {
                return resource;
            }
        } catch (RuntimeException ignored) {
            // Fall through to the streaming MultipartFileResource.
        }
        return MultipartFile.super.getResource();
    }

    @Override
    public void transferTo(File dest) throws IOException, IllegalStateException {
        try (InputStream inputStream = getInputStream()) {
            Files.copy(inputStream, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
