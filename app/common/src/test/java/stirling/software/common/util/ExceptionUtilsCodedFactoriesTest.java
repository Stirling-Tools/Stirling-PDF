package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.function.Supplier;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.common.util.ExceptionUtils.ErrorCodeProvider;

/**
 * Factories whose exceptions used to carry a coded message but no code. Each is pinned to its code
 * and to its supertype: the one it always had, or for the OCR settings and PDF/A ones the type a
 * bad parameter or a failed tool should have been all along.
 */
class ExceptionUtilsCodedFactoriesTest {

    static Stream<Arguments> factories() {
        return Stream.of(
                coded("E005", ExceptionUtils::createPdfNoPages, IllegalArgumentException.class),
                coded(
                        "E006",
                        ExceptionUtils::createPdfFileRequiredException,
                        IllegalArgumentException.class),
                coded(
                        "E033",
                        ExceptionUtils::createFileNoNameException,
                        IllegalArgumentException.class),
                coded(
                        "E061",
                        ExceptionUtils::createHtmlFileRequiredException,
                        IllegalArgumentException.class),
                coded(
                        "E034",
                        () -> ExceptionUtils.createImageReadException("a.png"),
                        IOException.class),
                coded(
                        "E030",
                        () -> ExceptionUtils.createFileNotFoundException("f-1"),
                        IOException.class),
                coded(
                        "E042",
                        ExceptionUtils::createOcrToolsUnavailableException,
                        IOException.class),
                coded(
                        "E062",
                        ExceptionUtils::createPythonRequiredForWebpException,
                        IOException.class),
                coded(
                        "E040",
                        ExceptionUtils::createOcrLanguageRequiredException,
                        IllegalArgumentException.class),
                coded(
                        "E041",
                        ExceptionUtils::createOcrInvalidLanguagesException,
                        IllegalArgumentException.class),
                coded(
                        "E043",
                        ExceptionUtils::createOcrInvalidRenderTypeException,
                        IllegalArgumentException.class),
                coded(
                        "E044",
                        () -> ExceptionUtils.createOcrProcessingFailedException(2),
                        IOException.class),
                coded(
                        "E050",
                        ExceptionUtils::createCompressionOptionsRequiredException,
                        IllegalArgumentException.class),
                coded(
                        "E051",
                        () -> ExceptionUtils.createGhostscriptConversionException("pdf"),
                        IOException.class),
                coded(
                        "E052",
                        () -> ExceptionUtils.createQpdfCompressionException(new IOException("x")),
                        IOException.class),
                coded(
                        "E053",
                        () ->
                                ExceptionUtils.createProcessingInterruptedException(
                                        "qpdf", new InterruptedException()),
                        IOException.class),
                coded(
                        "E060",
                        ExceptionUtils::createPdfaConversionFailedException,
                        IOException.class),
                coded(
                        "E070",
                        () -> ExceptionUtils.createInvalidArgumentException("comparator", "~"),
                        IllegalArgumentException.class),
                coded(
                        "E072",
                        () -> ExceptionUtils.createInvalidPageSizeException("A9"),
                        IllegalArgumentException.class));
    }

    private static Arguments coded(
            String code, Supplier<? extends Throwable> factory, Class<?> keptSupertype) {
        return Arguments.of(code, factory, keptSupertype);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("factories")
    void carriesItsCodeAndKeepsItsSupertype(
            String code, Supplier<? extends Throwable> factory, Class<?> keptSupertype) {
        Throwable thrown = factory.get();

        assertThat(thrown).isInstanceOf(ErrorCodeProvider.class).isInstanceOf(keptSupertype);
        assertThat(((ErrorCodeProvider) thrown).getErrorCode()).isEqualTo(code);
        assertThat(thrown.getMessage()).isNotBlank();
    }
}
