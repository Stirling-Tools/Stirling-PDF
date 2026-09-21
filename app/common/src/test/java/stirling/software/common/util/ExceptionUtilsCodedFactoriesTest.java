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
 * and to the supertype it always had, so no caller's catch or throws changed meaning.
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
                        IOException.class));
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
