package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils.BaseAppException;
import stirling.software.common.util.ExceptionUtils.NativeLibraryUnavailableException;
import stirling.software.jpdfium.exception.NativeLoadException;

/**
 * A native library that will not load surfaces as a LinkageError, which slips past every
 * catch(Exception) guard and reaches the user as a 500 with a null message. Detection has to be
 * narrow enough that an unrelated LinkageError is never reported as a missing native library.
 */
@DisplayName("Native library failure detection")
class ExceptionUtilsNativeLibraryTest {

    private static Throwable withJpdfiumFrame(Throwable t) {
        t.setStackTrace(
                new StackTraceElement[] {
                    new StackTraceElement(
                            "stirling.software.jpdfium.panama.NativeLoader",
                            "ensureLoaded",
                            "NativeLoader.java",
                            44)
                });
        return t;
    }

    @Test
    @DisplayName("First touch of the class: ExceptionInInitializerError wrapping the loader error")
    void detectsFirstTouchFailure() {
        Throwable cause = new NativeLoadException("Failed to load native library");
        ExceptionInInitializerError error = new ExceptionInInitializerError(cause);

        assertThat(ExceptionUtils.isNativeLibraryFailure(error)).isTrue();
    }

    @Test
    @DisplayName("Every touch after: NoClassDefFoundError naming the uninitialised class")
    void detectsSubsequentFailure() {
        NoClassDefFoundError error =
                new NoClassDefFoundError(
                        "Could not initialize class stirling.software.jpdfium.panama.JpdfiumLib");

        assertThat(ExceptionUtils.isNativeLibraryFailure(error)).isTrue();
    }

    @Test
    @DisplayName("Detected from a stack frame when the message gives nothing away")
    void detectsFromStackFrame() {
        ExceptionInInitializerError error = new ExceptionInInitializerError();
        withJpdfiumFrame(error);

        assertThat(ExceptionUtils.isNativeLibraryFailure(error)).isTrue();
    }

    @Test
    @DisplayName("An unrelated LinkageError is not reported as a missing native library")
    void ignoresUnrelatedLinkageError() {
        NoSuchMethodError error =
                new NoSuchMethodError("org.example.Widget.spin()Ljava/lang/String;");

        assertThat(ExceptionUtils.isNativeLibraryFailure(error)).isFalse();
    }

    @Test
    @DisplayName("Ordinary exceptions are never native library failures")
    void ignoresOrdinaryExceptions() {
        assertThat(ExceptionUtils.isNativeLibraryFailure(new RuntimeException("boom"))).isFalse();
        assertThat(ExceptionUtils.isNativeLibraryFailure(new java.io.IOException("boom")))
                .isFalse();
    }

    @Test
    @DisplayName("A cyclic cause chain terminates instead of spinning")
    void survivesCyclicCauseChain() {
        // Java rejects direct self-causation but not a cycle built across two throwables.
        NoClassDefFoundError inner = new NoClassDefFoundError("nothing to see here");
        NoClassDefFoundError outer = new NoClassDefFoundError("still nothing");
        outer.initCause(inner);
        inner.initCause(outer);

        assertThat(ExceptionUtils.isNativeLibraryFailure(outer)).isFalse();
    }

    @Test
    @DisplayName("Translates to a typed application exception the error handler can render")
    void translatesToTypedException() {
        ExceptionInInitializerError error =
                new ExceptionInInitializerError(
                        new NativeLoadException("Failed to load native library"));

        NativeLibraryUnavailableException translated =
                ExceptionUtils.createNativeLibraryUnavailableException(error);

        assertThat(translated).isInstanceOf(BaseAppException.class);
        assertThat(translated.getErrorCode()).isEqualTo("E082");
        assertThat(translated.getMessage()).isNotBlank();
        assertThat(translated.getCause()).isSameAs(error);
    }
}
