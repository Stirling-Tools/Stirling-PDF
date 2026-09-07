package stirling.software.common.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

/**
 * Whether a chain of steps can run: what each produces against what the next accepts.
 *
 * <p>The frontend and the AI engine implement the same rules against their generated copies, so a
 * chain can be checked without a round trip. {@code testing/tool-io-cases.json} pins all three to
 * the same answers.
 */
@Service
@RequiredArgsConstructor
public class ToolChainValidator {

    /** {@code parameters} may be null; only used to resolve an output that depends on one. */
    public record Step(String operation, Map<String, Object> parameters) {}

    private final ToolIOSource toolIO;

    public List<ToolDiagnostic> validate(List<Step> steps) {
        return validate(steps, null);
    }

    /**
     * @param sourceFormat the format entering step one, or null when unknown
     */
    public List<ToolDiagnostic> validate(List<Step> steps, ToolFormat sourceFormat) {
        List<ToolDiagnostic> diagnostics = new ArrayList<>();
        ToolIOSpec.Output carried = null;

        for (int i = 0; i < steps.size(); i++) {
            Step step = steps.get(i);
            Optional<ToolIOSpec> found = toolIO.find(step.operation());
            if (found.isEmpty()) {
                diagnostics.add(
                        ToolDiagnostic.warn(
                                i,
                                ToolDiagnostic.UNDECLARED,
                                "Step "
                                        + step.operation()
                                        + " does not declare what it accepts or produces, so the"
                                        + " rest of the chain cannot be checked."));
                // Nothing is known past an undeclared step.
                carried = null;
                continue;
            }
            ToolIOSpec spec = found.get();

            // Only the first step is handed the pipeline's input. Every later step is handed the
            // previous step's output, which is simply unknown once an undeclared step intervened -
            // checking it against the input again would judge it on a format it never receives.
            if (i == 0) {
                checkSource(diagnostics, i, step, spec, sourceFormat);
            } else if (carried != null) {
                checkTransition(diagnostics, i, step, spec, carried);
            }
            carried = spec.resolveOutput(step.parameters());
        }
        return diagnostics;
    }

    public static boolean hasErrors(List<ToolDiagnostic> diagnostics) {
        return diagnostics.stream().anyMatch(d -> d.severity() == ToolDiagnostic.Severity.ERROR);
    }

    private static void checkSource(
            List<ToolDiagnostic> diagnostics,
            int index,
            Step step,
            ToolIOSpec spec,
            ToolFormat sourceFormat) {
        if (sourceFormat == null || spec.acceptsFormat(sourceFormat)) {
            return;
        }
        diagnostics.add(
                ToolDiagnostic.error(
                        index,
                        ToolDiagnostic.SOURCE_MISMATCH,
                        "Step "
                                + step.operation()
                                + " accepts "
                                + describe(spec)
                                + " but the pipeline's input is "
                                + sourceFormat
                                + "."));
    }

    private static void checkTransition(
            List<ToolDiagnostic> diagnostics,
            int index,
            Step step,
            ToolIOSpec spec,
            ToolIOSpec.Output previous) {

        if (previous.format() == ToolFormat.NONE) {
            diagnostics.add(
                    ToolDiagnostic.error(
                            index,
                            ToolDiagnostic.FORMAT_MISMATCH,
                            "The previous step returns a report rather than a file, so "
                                    + step.operation()
                                    + " has nothing to run on."));
            return;
        }

        if (!spec.acceptsFormat(previous.format())) {
            String message =
                    "Step "
                            + step.operation()
                            + " accepts "
                            + describe(spec)
                            + " but the previous step produces "
                            + previous.format()
                            + ".";
            diagnostics.add(
                    previous.certain()
                            ? ToolDiagnostic.error(index, ToolDiagnostic.FORMAT_MISMATCH, message)
                            // Unresolved output: may yet be fine once the step is configured.
                            : ToolDiagnostic.warn(index, ToolDiagnostic.OUTPUT_UNCERTAIN, message));
            return;
        }

        if (!previous.certain()) {
            diagnostics.add(
                    ToolDiagnostic.warn(
                            index,
                            ToolDiagnostic.OUTPUT_UNCERTAIN,
                            "The previous step's output depends on how it is configured, so this"
                                    + " step may not be able to run."));
            return;
        }

        if (previous.arity().isMultiOutput()) {
            diagnostics.add(
                    spec.arity().isMultiInput()
                            ? ToolDiagnostic.info(
                                    index,
                                    ToolDiagnostic.FAN_IN,
                                    "This step combines every file the previous step produced.")
                            : ToolDiagnostic.info(
                                    index,
                                    ToolDiagnostic.FAN_OUT,
                                    "This step runs once for each file the previous step"
                                            + " produced."));
        }
    }

    private static String describe(ToolIOSpec spec) {
        return spec.accepts().stream()
                .map(Enum::name)
                .sorted()
                .reduce((a, b) -> a + " or " + b)
                .orElse("nothing");
    }
}
