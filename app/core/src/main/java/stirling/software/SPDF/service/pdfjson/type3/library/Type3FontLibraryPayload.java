package stirling.software.SPDF.service.pdfjson.type3.library;

import java.io.IOException;
import java.io.InputStream;
import java.util.Base64;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

import org.springframework.core.io.Resource;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class Type3FontLibraryPayload {
    private static final long FAILURE_RETRY_DELAY_NANOS = TimeUnit.SECONDS.toNanos(1);

    private final String directBase64;
    private final Resource resource;
    private final String format;
    private volatile String cachedBase64;
    private volatile long retryAfterNanos;

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
        if (System.nanoTime() < retryAfterNanos) {
            return null;
        }
        if (cachedBase64 == null) {
            synchronized (this) {
                if (cachedBase64 == null) {
                    if (System.nanoTime() < retryAfterNanos) {
                        return null;
                    }
                    try (InputStream is = resource.getInputStream()) {
                        byte[] bytes = is.readAllBytes();
                        if (bytes.length == 0) {
                            retryAfterNanos = System.nanoTime() + FAILURE_RETRY_DELAY_NANOS;
                            return null;
                        }
                        cachedBase64 = Base64.getEncoder().encodeToString(bytes);
                        retryAfterNanos = 0;
                    } catch (IOException e) {
                        retryAfterNanos = System.nanoTime() + FAILURE_RETRY_DELAY_NANOS;
                        log.warn(
                                "[TYPE3] Failed to read Type3 payload {}: {}",
                                resource.getDescription(),
                                e.getMessage());
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
        // Compare descriptors only: resolving base64 reads and encodes the whole font file, so
        // equality must never trigger it.
        return Objects.equals(directBase64, that.directBase64)
                && Objects.equals(describe(resource), describe(that.resource))
                && Objects.equals(format, that.format);
    }

    @Override
    public int hashCode() {
        return Objects.hash(directBase64, describe(resource), format);
    }

    private static String describe(Resource resource) {
        return resource == null ? null : resource.getDescription();
    }
}
