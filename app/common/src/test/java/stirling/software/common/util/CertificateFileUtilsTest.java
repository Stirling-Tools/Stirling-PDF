package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

class CertificateFileUtilsTest {

    @Test
    void rejectsActualContentLargerThanDeclaredSize() throws Exception {
        MultipartFile deceptiveFile = mock(MultipartFile.class);
        when(deceptiveFile.isEmpty()).thenReturn(false);
        when(deceptiveFile.getSize()).thenReturn(1L);
        when(deceptiveFile.getBytes())
                .thenReturn(
                        new byte
                                [Math.toIntExact(
                                                CertificateFileUtils
                                                        .MAX_CERTIFICATE_FILE_SIZE_BYTES)
                                        + 1]);

        assertThatThrownBy(() -> CertificateFileUtils.read(deceptiveFile))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        error ->
                                org.assertj.core.api.Assertions.assertThat(
                                                ((ResponseStatusException) error)
                                                        .getStatusCode()
                                                        .value())
                                        .isEqualTo(413));
        verify(deceptiveFile).getBytes();
    }
}
