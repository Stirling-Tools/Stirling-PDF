package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.topdf.OfficeToPdf;

class OfficeToPdfServiceTest {
    private final OfficeToPdfService service =
            new OfficeToPdfService(new ApplicationProperties(), null);
    private final Path input = Path.of("document.docx");
    private final Path output = Path.of("document.pdf");

    @ParameterizedTest
    @CsvSource({"true,false", "false,true"})
    void incompleteOutputFails(boolean truncated, boolean pageLimitReached) throws Exception {
        var options = service.options();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenReturn(new OfficeToPdf.Result(1, truncated, List.of(), pageLimitReached));

            IOException failure =
                    assertThrows(IOException.class, () -> service.convert(input, output, options));

            assertThat(failure).hasMessage("Only part of document.docx could be converted");
        }
    }

    @Test
    void completeOutputIsAccepted() throws Exception {
        var options = service.options();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenReturn(new OfficeToPdf.Result(1, false, List.of(), false));

            service.convert(input, output, options);
        }
    }
}
