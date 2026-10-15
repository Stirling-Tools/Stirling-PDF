package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.model.api.misc.AdjustColorsRequest;
import stirling.software.SPDF.service.toolscore.ColorAdjustments;
import stirling.software.SPDF.service.toolscore.ToolsCoreLibrary;

@ExtendWith(MockitoExtension.class)
class AdjustColorsRustControllerTest {

    private static final byte[] INPUT = "%PDF-1.7 input".getBytes();
    private static final byte[] OUTPUT = "%PDF-1.7 output".getBytes();

    @Mock private ToolsCoreLibrary toolsCore;
    @InjectMocks private AdjustColorsRustController controller;

    @Test
    void passesTheRequestedAdjustmentsToTheRustLibrary() throws IOException {
        when(toolsCore.isAvailable()).thenReturn(true);
        when(toolsCore.adjustColors(any(), any())).thenReturn(OUTPUT);
        AdjustColorsRequest request = request();
        request.setContrast(150);
        request.setBrightness(90);
        request.setSaturation(0);
        request.setRed(110);
        request.setGreen(120);
        request.setBlue(130);

        ResponseEntity<byte[]> response = controller.adjustColors(request);

        verify(toolsCore).adjustColors(INPUT, new ColorAdjustments(150, 90, 0, 110, 120, 130));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
        assertThat(response.getBody()).isEqualTo(OUTPUT);
    }

    @Test
    void answersServiceUnavailableWithoutTheLibrary() {
        when(toolsCore.isAvailable()).thenReturn(false);

        assertThatThrownBy(() -> controller.adjustColors(request()))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e ->
                                assertThat(e.getStatusCode())
                                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        verify(toolsCore, never()).adjustColors(any(), any());
    }

    private static AdjustColorsRequest request() {
        AdjustColorsRequest request = new AdjustColorsRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "scan.pdf", MediaType.APPLICATION_PDF_VALUE, INPUT));
        return request;
    }
}
