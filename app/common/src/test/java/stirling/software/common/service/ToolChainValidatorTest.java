package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

/** Unknown operations, which only the server can detect and so sit outside the shared cases. */
class ToolChainValidatorTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String EXTRACT_IMAGES = "/api/v1/misc/extract-images";
    private static final String UNDECLARED = "/api/v1/misc/undeclared";

    private static final Map<String, ToolIOSpec> SPECS =
            Map.of(
                    ROTATE,
                    new ToolIOSpec(
                            Set.of(ToolFormat.PDF), ToolFormat.PDF, ToolArity.SISO, List.of()),
                    EXTRACT_IMAGES,
                    new ToolIOSpec(
                            Set.of(ToolFormat.PDF), ToolFormat.IMAGE, ToolArity.SIMO, List.of()));

    private static final ToolIOSource SOURCE =
            new ToolIOSource() {
                @Override
                public Optional<ToolIOSpec> find(String operationPath) {
                    return Optional.ofNullable(SPECS.get(operationPath));
                }

                @Override
                public boolean isKnown(String operationPath) {
                    return Set.of(ROTATE, EXTRACT_IMAGES, UNDECLARED).contains(operationPath);
                }
            };

    private final ToolChainValidator validator = new ToolChainValidator(SOURCE);

    @Test
    void anUnknownOperationIsAnErrorNamingIt() {
        List<ToolDiagnostic> diagnostics =
                validator.validate(steps(ROTATE, "/api/v1/misc/no-such-tool"));

        assertEquals(1, diagnostics.size());
        ToolDiagnostic diagnostic = diagnostics.get(0);
        assertEquals(1, diagnostic.stepIndex());
        assertEquals(ToolDiagnostic.Severity.ERROR, diagnostic.severity());
        assertEquals(ToolDiagnostic.UNKNOWN_OPERATION, diagnostic.code());
        assertTrue(diagnostic.message().contains("/api/v1/misc/no-such-tool"));
        assertTrue(ToolChainValidator.hasErrors(diagnostics));
    }

    @Test
    void aBlankOperationIsUnknown() {
        List<ToolDiagnostic> diagnostics =
                validator.validate(
                        List.of(
                                new ToolChainValidator.Step(null, null),
                                new ToolChainValidator.Step("", null)));

        assertEquals(2, diagnostics.size());
        assertTrue(
                diagnostics.stream()
                        .allMatch(d -> ToolDiagnostic.UNKNOWN_OPERATION.equals(d.code())));
    }

    @Test
    void aKnownButUndeclaredOperationOnlyWarns() {
        List<ToolDiagnostic> diagnostics = validator.validate(steps(UNDECLARED, ROTATE));

        assertEquals(1, diagnostics.size());
        assertEquals(ToolDiagnostic.UNDECLARED, diagnostics.get(0).code());
        assertFalse(ToolChainValidator.hasErrors(diagnostics));
    }

    @Test
    void nothingPastAnUnknownStepIsJudged() {
        // Extract-images then rotate is a mismatch, but the unknown step between them breaks the
        // carry, so only the unknown step is reported.
        List<ToolDiagnostic> diagnostics =
                validator.validate(steps(EXTRACT_IMAGES, "/api/v1/misc/nope", ROTATE));

        assertEquals(1, diagnostics.size());
        assertEquals(ToolDiagnostic.UNKNOWN_OPERATION, diagnostics.get(0).code());
    }

    @Test
    void aSourceThatCannotListEndpointsTreatsEveryPathAsKnown() {
        ToolChainValidator lenient = new ToolChainValidator(ToolIOSource.of(SPECS));

        List<ToolDiagnostic> diagnostics = lenient.validate(steps("/api/v1/misc/anything"));

        assertEquals(ToolDiagnostic.UNDECLARED, diagnostics.get(0).code());
        assertEquals(ToolDiagnostic.Severity.WARN, diagnostics.get(0).severity());
    }

    private static List<ToolChainValidator.Step> steps(String... operations) {
        return java.util.Arrays.stream(operations)
                .map(op -> new ToolChainValidator.Step(op, null))
                .toList();
    }
}
