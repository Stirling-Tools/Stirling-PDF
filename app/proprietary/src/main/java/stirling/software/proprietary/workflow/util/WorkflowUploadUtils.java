package stirling.software.proprietary.workflow.util;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.util.CertificateFileUtils;

/** Shared size and shape validation for workflow credential uploads. */
public final class WorkflowUploadUtils {

    public static final long MAX_CREDENTIAL_FILE_SIZE_BYTES =
            CertificateFileUtils.MAX_CERTIFICATE_FILE_SIZE_BYTES;
    public static final int MAX_WET_SIGNATURE_DATA_CHARS = 5 * 1024 * 1024;

    private WorkflowUploadUtils() {}

    public static byte[] readCredentialFile(MultipartFile file) throws IOException {
        return CertificateFileUtils.read(file);
    }

    public static void rejectMultipleKeystores(MultipartFile p12File, MultipartFile jksFile) {
        if (hasContent(p12File) && hasContent(jksFile)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Provide only one certificate keystore");
        }
    }

    public static void validateWetSignatureDataSize(String wetSignatureData) {
        if (wetSignatureData != null && wetSignatureData.length() > MAX_WET_SIGNATURE_DATA_CHARS) {
            throw new ResponseStatusException(
                    HttpStatus.CONTENT_TOO_LARGE, "Wet signatures data exceeds the 5 MiB limit");
        }
    }

    private static boolean hasContent(MultipartFile file) {
        return file != null && !file.isEmpty();
    }
}
