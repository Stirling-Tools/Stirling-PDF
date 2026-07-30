package stirling.software.common.model.tool;

/**
 * One problem found while checking a chain of tool steps, reported against the step that cannot
 * run.
 *
 * @param stepIndex zero-based index of the offending step
 * @param severity how much it matters; only {@link Severity#ERROR} should block a save
 * @param code stable machine-readable identifier, so the frontend can pick its own wording
 * @param message English fallback describing the problem
 */
public record ToolDiagnostic(int stepIndex, Severity severity, String code, String message) {

    public enum Severity {
        /** The chain cannot run as configured. */
        ERROR,
        /** The chain may not run, depending on configuration or file content. */
        WARN,
        /** Worth knowing but not a problem, such as a step running once per file. */
        INFO
    }

    /** The step's endpoint declares no {@link ToolIO}, so nothing can be checked past it. */
    public static final String UNDECLARED = "undeclared-operation";

    /** The previous step's output is not a format this step accepts. */
    public static final String FORMAT_MISMATCH = "format-mismatch";

    /** The previous step's output depends on a parameter that is not set yet. */
    public static final String OUTPUT_UNCERTAIN = "output-uncertain";

    /** The pipeline's input files are not a format the first step accepts. */
    public static final String SOURCE_MISMATCH = "source-mismatch";

    /** The previous step emits several files and this one runs once per file. */
    public static final String FAN_OUT = "fan-out";

    /** The previous step emits several files and this one consumes them in a single call. */
    public static final String FAN_IN = "fan-in";

    public static ToolDiagnostic error(int stepIndex, String code, String message) {
        return new ToolDiagnostic(stepIndex, Severity.ERROR, code, message);
    }

    public static ToolDiagnostic warn(int stepIndex, String code, String message) {
        return new ToolDiagnostic(stepIndex, Severity.WARN, code, message);
    }

    public static ToolDiagnostic info(int stepIndex, String code, String message) {
        return new ToolDiagnostic(stepIndex, Severity.INFO, code, message);
    }
}
