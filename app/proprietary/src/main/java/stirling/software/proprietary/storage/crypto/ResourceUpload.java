package stirling.software.proprietary.storage.crypto;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.Resource;

/**
 * Presents a loaded {@link Resource} as a {@link MultipartFile} so existing blobs can be re-stored
 * through {@code StorageProvider.store(...)} — the encrypt-existing migration re-uploads plaintext
 * blobs through the encrypting decorator this way. The size must be accurate: the decorator records
 * it as the plaintext length in the blob header.
 */
public class ResourceUpload implements MultipartFile {

    private final Resource resource;
    private final String filename;
    private final String contentType;
    private final long sizeBytes;

    public ResourceUpload(Resource resource, String filename, String contentType, long sizeBytes) {
        this.resource = resource;
        this.filename = filename;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
    }

    @Override
    public String getName() {
        return "file";
    }

    @Override
    public String getOriginalFilename() {
        return filename;
    }

    @Override
    public String getContentType() {
        return contentType;
    }

    @Override
    public boolean isEmpty() {
        return sizeBytes == 0;
    }

    @Override
    public long getSize() {
        return sizeBytes;
    }

    @Override
    public byte[] getBytes() throws IOException {
        try (InputStream in = resource.getInputStream()) {
            return in.readAllBytes();
        }
    }

    @Override
    public InputStream getInputStream() throws IOException {
        return resource.getInputStream();
    }

    @Override
    public void transferTo(File dest) throws IOException {
        try (InputStream in = resource.getInputStream()) {
            Files.copy(in, dest.toPath());
        }
    }
}
