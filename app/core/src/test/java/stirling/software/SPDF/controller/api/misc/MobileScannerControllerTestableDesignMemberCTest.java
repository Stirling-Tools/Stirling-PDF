package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

class MobileScannerControllerTestableDesignMemberCTest {

    @Test
    void validateUploadFiles_whenNull_thenReturnsError() {
        assertThat(MobileScannerController.validateUploadFiles(null))
                .isEqualTo("No files provided");
    }

    @Test
    void validateUploadFiles_whenEmpty_thenReturnsError() {
        assertThat(MobileScannerController.validateUploadFiles(List.of()))
                .isEqualTo("No files provided");
    }

    @Test
    void validateUploadFiles_whenHasFile_thenReturnsNull() {
        MultipartFile f = mock(MultipartFile.class);
        assertThat(MobileScannerController.validateUploadFiles(List.of(f))).isNull();
    }
}
