package stirling.software.common.model.multipart;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.model.io.Resource;

/**
 * In-memory {@link MultipartFile} backed by a byte array. Useful for tests and for code paths that
 * synthesize file content (migration shim - see {@link MultipartFile}).
 */
public class ByteArrayMultipartFile implements MultipartFile {

    private final String name;
    private final String originalFilename;
    private final String contentType;
    private final byte[] content;

    public ByteArrayMultipartFile(
            String name, String originalFilename, String contentType, byte[] content) {
        this.name = name;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.content = content != null ? content : new byte[0];
    }

    @Override
    public String getName() {
        return name;
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
        return content.length == 0;
    }

    @Override
    public long getSize() {
        return content.length;
    }

    @Override
    public byte[] getBytes() {
        return content;
    }

    @Override
    public InputStream getInputStream() {
        return new ByteArrayInputStream(content);
    }

    @Override
    public Resource getResource() {
        return new InputStreamResource(new ByteArrayInputStream(content), originalFilename);
    }
}
