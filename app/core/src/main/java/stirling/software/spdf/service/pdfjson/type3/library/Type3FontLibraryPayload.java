package stirling.software.spdf.service.pdfjson.type3.library;

import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Objects;

import org.springframework.core.io.Resource;

public class Type3FontLibraryPayload {
    private final String directBase64;
    private final Resource resource;
    private final String format;
    private volatile String cachedBase64;

    public Type3FontLibraryPayload(String base64, String format) {
        this.directBase64 = base64;
        this.resource = null;
        this.format = format;
    }

    public Type3FontLibraryPayload(Resource resource, String format) {
        this.directBase64 = null;
        this.resource = resource;
        this.format = format;
    }

    public String getBase64() {
        if (directBase64 != null) {
            return directBase64;
        }
        if (resource == null) {
            return null;
        }
        if (cachedBase64 == null) {
            synchronized (this) {
                if (cachedBase64 == null) {
                    try (InputStream is = resource.getInputStream()) {
                        byte[] bytes = is.readAllBytes();
                        cachedBase64 = Base64.getEncoder().encodeToString(bytes);
                    } catch (IOException e) {
                        return null;
                    }
                }
            }
        }
        return cachedBase64;
    }

    public String getFormat() {
        return format;
    }

    public boolean hasPayload() {
        if (directBase64 != null) {
            return !directBase64.isBlank();
        }
        return resource != null && resource.exists();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Type3FontLibraryPayload that = (Type3FontLibraryPayload) o;
        return Objects.equals(getBase64(), that.getBase64()) && Objects.equals(format, that.format);
    }

    @Override
    public int hashCode() {
        return Objects.hash(getBase64(), format);
    }
}
