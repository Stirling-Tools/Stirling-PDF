package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.topdf.OfficeToPdf;

class OfficeToPdfServiceTest {
    private final OfficeToPdfService service =
            new OfficeToPdfService(new ApplicationProperties(), null);
    private final Path input = Path.of("document.docx");
    private final Path output = Path.of("document.pdf");

    @Test
    void truncatedOutputFails() throws Exception {
        var options = service.options();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenReturn(new OfficeToPdf.Result(1, true, List.of(), false));

            IOException failure =
                    assertThrows(IOException.class, () -> service.convert(input, output, options));

            assertThat(failure).hasMessage("Only part of document.docx could be converted");
        }
    }

    @Test
    void pageLimitIsReportedAsAnInputProblem() throws Exception {
        var options = service.options().maxPages(50);
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenReturn(new OfficeToPdf.Result(50, false, List.of(), true));

            IllegalArgumentException failure =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> service.convert(input, output, options));

            assertThat(failure.getMessage())
                    .contains("document.docx would be longer than 50 pages");
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
