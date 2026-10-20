package stirling.software.proprietary.classification;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_BYTE;
import static java.lang.foreign.ValueLayout.JAVA_INT;
import static java.lang.foreign.ValueLayout.JAVA_LONG;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.MemorySegment;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;
import java.util.Optional;

import org.springframework.stereotype.Service;

import stirling.software.common.toolscore.RustToolsLibrary;
import stirling.software.jpdfium.PdfDocument;

/**
 * The rule-based classifier in {@code tools-core/proprietary/classify}, built as the {@code
 * stirling-tools-proprietary} library. The editor runs the same code as wasm.
 */
@Service
public class RulesClassifier {

    private static final String LIBRARY = "stirling-tools-proprietary";
    private static final FunctionDescriptor CLASSIFY_SIGNATURE =
            FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS, JAVA_LONG, JAVA_INT);
    private static final int RECORD_IN_METADATA = 1;

    /**
     * {@code pdf} with the verdict stored in its metadata, and the verdict as JSON: {@code labels}
     * (ids, best first), {@code confidence}, {@code probability}, {@code score} and {@code
     * candidates} with the evidence for each.
     */
    public record Classified(byte[] pdf, String verdictJson) {}

    public boolean isAvailable() {
        return library().isPresent();
    }

    /**
     * Classifies {@code pdf}, whose {@code fileName} the file-name rules read, and stores the
     * verdict in its {@code StirlingPDFClassification} metadata as the AI classify step does.
     *
     * @throws IllegalStateException if the library is not available, or reports a failure
     */
    public Classified classify(byte[] pdf, String fileName) {
        RustToolsLibrary library =
                library().orElseThrow(() -> new IllegalStateException("Rust tools not available"));
        MethodHandle classify = library.function("stirling_classify", CLASSIFY_SIGNATURE);
        byte[] name = fileName.getBytes(StandardCharsets.UTF_8);
        try (PdfDocument document = PdfDocument.open(pdf);
                Arena arena = Arena.ofConfined()) {
            MemorySegment nameSegment = arena.allocate(Math.max(name.length, 1));
            MemorySegment.copy(name, 0, nameSegment, JAVA_BYTE, 0, name.length);
            String verdict =
                    library.run(
                            () ->
                                    (int)
                                            classify.invokeExact(
                                                    document.rawHandle(),
                                                    nameSegment,
                                                    (long) name.length,
                                                    RECORD_IN_METADATA));
            return new Classified(document.saveBytes(), verdict);
        }
    }

    private static Optional<RustToolsLibrary> library() {
        return RustToolsLibrary.named(LIBRARY);
    }
}
