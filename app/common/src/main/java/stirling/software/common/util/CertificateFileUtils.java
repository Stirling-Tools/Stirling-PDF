package stirling.software.common.util;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Size validation and bounded reads for certificate credentials supplied as multipart files. */
public final class CertificateFileUtils {

    public static final long MAX_CERTIFICATE_FILE_SIZE_BYTES = 5L * 1024 * 1024;

    private CertificateFileUtils() {}

    public static void validateSize(MultipartFile file) {
        if (file != null && !file.isEmpty() && file.getSize() > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
            throw certificateFileTooLarge();
        }
    }

    public static byte[] read(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return null;
        }
        validateSize(file);

        byte[] bytes = file.getBytes();
        if (bytes.length > MAX_CERTIFICATE_FILE_SIZE_BYTES) {
            throw certificateFileTooLarge();
        }
        return bytes;
    }

    private static ResponseStatusException certificateFileTooLarge() {
        return new ResponseStatusException(
                HttpStatus.CONTENT_TOO_LARGE,
                "Certificate credential file exceeds the 5 MiB limit");
    }
}
