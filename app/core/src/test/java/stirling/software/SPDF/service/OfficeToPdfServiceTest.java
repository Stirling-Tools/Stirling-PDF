package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mockStatic;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.officeconvert.memory.Admission;
import stirling.software.officeconvert.topdf.OfficeToPdf;

class OfficeToPdfServiceTest {
    private final OfficeToPdfService service =
            new OfficeToPdfService(new ApplicationProperties(), null);
    private final Path input = Path.of("document.docx");
    private final Path output = Path.of("document.pdf");

    @ParameterizedTest
    @CsvSource({"3, 3", "0, 0", "-2, 0"})
    void sessionLimitCapsOfficeConvertsQueue(int setting, int applied) {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getProcessExecutor().getSessionLimit().setOfficeConvertSessionLimit(setting);
        ArgumentCaptor<Admission.Limits> limits = ArgumentCaptor.forClass(Admission.Limits.class);
        try (MockedStatic<Admission> admission = mockStatic(Admission.class)) {
            new OfficeToPdfService(properties, null).applySessionLimit();
            admission.verify(() -> Admission.configure(limits.capture()));
        }
        assertThat(limits.getValue().maxConcurrent()).isEqualTo(applied);
        assertThat(limits.getValue().maxWait()).isEqualTo(Admission.Limits.defaults().maxWait());
    }

    @Test
    void damagedInputIsABadRequestWithoutTheExceptionName() throws Exception {
        var options = service.options();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenThrow(new java.util.zip.ZipException("zip END header not found"));

            IllegalArgumentException e =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> service.convert(input, output, options));
            assertThat(e.getMessage())
                    .isEqualTo("The file could not be read: it is damaged or incomplete");
        }
    }

    @ParameterizedTest
    @CsvSource({
        "true, unsupported",
        "true, zip",
        "true, eof",
        "true, notOffice",
        "false, timeout",
        "false, disk"
    })
    void onlyUnreadableInputCountsAsTheCallersFault(boolean expected, String kind) {
        java.io.IOException e =
                switch (kind) {
                    case "unsupported" ->
                            new stirling.software.officeconvert.UnsupportedFormatException("x");
                    case "zip" -> new java.util.zip.ZipException("x");
                    case "eof" -> new java.io.EOFException("x");
                    case "notOffice" ->
                            new java.io.IOException("The file is not an Office document: x");
                    case "timeout" -> new java.io.InterruptedIOException("The file is not x");
                    default -> new java.io.IOException("No space left on device");
                };
        assertThat(OfficeToPdfService.unreadableInput(e)).isEqualTo(expected);
    }

    @Test
    void truncatedOutputNamesTheReason() throws Exception {
        var options = service.options();
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            engine.when(() -> OfficeToPdf.convert(input, output, options))
                    .thenReturn(
                            new OfficeToPdf.Result(
                                    1,
                                    true,
                                    List.of(
                                            "Arial is not installed; using Liberation Sans",
                                            "Only the start of the text was converted: the rest"
                                                    + " is past the page limit of 10000 pages"),
                                    false));

            IllegalArgumentException failure =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> service.convert(input, output, options));

            assertThat(failure.getMessage())
                    .startsWith("Only part of document.docx could be converted.")
                    .contains("past the page limit")
                    .doesNotContain("Arial");
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
                    .contains("Converting document.docx would produce more than 50 pages");
        }
    }

    @ParameterizedTest
    @CsvSource({"true,.zip", "false,.html"})
    void htmlPackagesOnlyGetPackageAccessWhenZipped(
            boolean packaged, String suffix, @TempDir Path dir) throws Exception {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().getTempFileManagement().setBaseTmpDir(dir.toString());
        var html =
                new OfficeToPdfService(
                        properties, new TempFileManager(new TempFileRegistry(), properties));
        try (MockedStatic<OfficeToPdf> engine = mockStatic(OfficeToPdf.class)) {
            ArgumentCaptor<Path> in = ArgumentCaptor.forClass(Path.class);
            ArgumentCaptor<OfficeToPdf.Options> options =
                    ArgumentCaptor.forClass(OfficeToPdf.Options.class);
            engine.when(() -> OfficeToPdf.convert(in.capture(), any(Path.class), options.capture()))
                    .thenReturn(new OfficeToPdf.Result(1, false, List.of(), false));

            html.convertHtml("<p>x</p>".getBytes(StandardCharsets.UTF_8), packaged);

            assertThat(in.getValue().toString()).endsWith(suffix);
            assertThat(options.getValue().allowPackages()).isEqualTo(packaged);
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
