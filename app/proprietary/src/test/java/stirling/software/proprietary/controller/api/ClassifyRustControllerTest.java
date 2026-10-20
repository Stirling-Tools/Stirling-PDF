package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

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

import stirling.software.common.model.api.PDFFile;
import stirling.software.proprietary.classification.RulesClassifier;

@ExtendWith(MockitoExtension.class)
class ClassifyRustControllerTest {

    private static final byte[] INPUT = "%PDF-1.7 input".getBytes();
    private static final byte[] OUTPUT = "%PDF-1.7 labelled".getBytes();
    private static final String VERDICT = "{\"labels\":[\"facture\"],\"evidence\":\"請求書\"}";

    @Mock private RulesClassifier classifier;
    @InjectMocks private ClassifyRustController controller;

    @Test
    void returnsTheLabelledPdfWithItsVerdictAndTiming() throws IOException {
        when(classifier.isAvailable()).thenReturn(true);
        when(classifier.classify(any(), any()))
                .thenReturn(new RulesClassifier.Classified(OUTPUT, VERDICT));

        ResponseEntity<byte[]> response = controller.classify(request("invoice.pdf"));

        verify(classifier).classify(INPUT, "invoice.pdf");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(OUTPUT);
        assertThat(response.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("invoice.pdf");
        String verdict = response.getHeaders().getFirst(ClassifyRustController.VERDICT_HEADER);
        assertThat(new String(Base64.getDecoder().decode(verdict), StandardCharsets.UTF_8))
                .isEqualTo(VERDICT);
        assertThat(response.getHeaders().getFirst(ClassifyRustController.SERVER_TIMING_HEADER))
                .matches("process;dur=\\d+\\.\\d");
    }

    @Test
    void namesAnUnnamedUploadSafely() throws IOException {
        when(classifier.isAvailable()).thenReturn(true);
        when(classifier.classify(any(), any()))
                .thenReturn(new RulesClassifier.Classified(OUTPUT, VERDICT));

        controller.classify(request(""));

        verify(classifier).classify(INPUT, "classified.pdf");
    }

    @Test
    void answersServiceUnavailableWithoutTheLibrary() {
        when(classifier.isAvailable()).thenReturn(false);

        assertThatThrownBy(() -> controller.classify(request("invoice.pdf")))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e ->
                                assertThat(e.getStatusCode())
                                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        verify(classifier, never()).classify(any(), any());
    }

    private static PDFFile request(String fileName) {
        PDFFile request = new PDFFile();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", fileName, MediaType.APPLICATION_PDF_VALUE, INPUT));
        return request;
    }
}
