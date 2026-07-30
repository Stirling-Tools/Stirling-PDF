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
 * Checks whether a chain of tool steps can actually run, by comparing what each step produces
 * against what the next one accepts.
 *
 * <p>The same rules are implemented in the frontend and in the AI engine, against the generated
 * copies of the same declarations, so a pipeline can be checked while it is being edited without a
 * round trip. {@code testing/tool-io-cases.json} pins all three implementations to the same
 * answers.
 */
@Service
@RequiredArgsConstructor
public class ToolChainValidator {

    /**
     * A step to check.
     *
     * @param operation the endpoint path
     * @param parameters the step's configured parameters, or null when they are not known; only
     *     used to resolve endpoints whose output depends on a parameter
     */
    public record Step(String operation, Map<String, Object> parameters) {

        public static Step of(String operation) {
            return new Step(operation, null);
        }
    }

    private final ToolIOSource toolIO;

    /** Check a chain fed by files of unknown type. */
    public List<ToolDiagnostic> validate(List<Step> steps) {
        return validate(steps, null);
    }

    /**
     * Check a chain, optionally knowing what the pipeline's input files are.
     *
     * @param sourceFormat the format of the files entering step one, or null when unknown
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
                // Nothing is known past an undeclared step, so stop carrying a stale output.
                carried = null;
                continue;
            }
            ToolIOSpec spec = found.get();

            if (carried == null) {
                checkSource(diagnostics, i, step, spec, sourceFormat);
            } else {
                checkTransition(diagnostics, i, step, spec, carried);
            }
            carried = spec.resolveOutput(step.parameters());
        }
        return diagnostics;
    }

    /** True if any diagnostic would stop the chain running. */
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
                            // The previous step's output turns on a parameter we cannot see, so
                            // this may yet be fine once it is configured.
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
