package stirling.software.SPDF.service.toolscore;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_DOUBLE;
import static java.lang.foreign.ValueLayout.JAVA_INT;

import java.lang.foreign.FunctionDescriptor;
import java.lang.invoke.MethodHandle;
import java.util.Optional;

import org.springframework.stereotype.Service;

import stirling.software.common.toolscore.RustToolsLibrary;
import stirling.software.jpdfium.PdfDocument;

/** The MIT tools in {@code tools-core/}, built as the {@code stirling-tools} library. */
@Service
public class ToolsCoreLibrary {

    private static final String LIBRARY = "stirling-tools";
    private static final FunctionDescriptor ADJUST_COLORS_SIGNATURE =
            FunctionDescriptor.of(
                    JAVA_INT,
                    ADDRESS,
                    ADDRESS,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE,
                    JAVA_DOUBLE);

    public boolean isAvailable() {
        return library().isPresent();
    }

    /**
     * Replaces every page of {@code pdf} with an adjusted image of it.
     *
     * @throws IllegalStateException if the library is not available, or reports a failure
     */
    public byte[] adjustColors(byte[] pdf, ColorAdjustments a) {
        RustToolsLibrary library =
                library().orElseThrow(() -> new IllegalStateException("Rust tools not available"));
        MethodHandle adjust = library.function("stirling_adjust_colors", ADJUST_COLORS_SIGNATURE);
        try (PdfDocument source = PdfDocument.open(pdf);
                PdfDocument target = PdfDocument.createEmpty()) {
            library.run(
                    () ->
                            (int)
                                    adjust.invokeExact(
                                            source.rawHandle(),
                                            target.rawHandle(),
                                            a.contrast(),
                                            a.brightness(),
                                            a.saturation(),
                                            a.red(),
                                            a.green(),
                                            a.blue()));
            return target.saveBytes();
        }
    }

    private static Optional<RustToolsLibrary> library() {
        return RustToolsLibrary.named(LIBRARY);
    }
}
