package stirling.software.saas.store;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * One line of the publish preflight report. {@code block} findings stop publishing, {@code warn}
 * findings are kept but worth a look, {@code info} findings say what the sanitiser removed. {@code
 * code} is stable so the frontend can pick its own wording; the title and detail are English
 * fallbacks. A finding names the concrete thing (a source, a field, a hostname) but never echoes a
 * blocked word.
 */
public record StoreFinding(
        Severity severity, String code, String title, String detail, Where where) {

    public enum Severity {
        BLOCK,
        WARN,
        INFO;

        @JsonValue
        public String json() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /**
     * What the finding refers to: a step (with its index and operation), the details form, the
     * input or the output.
     */
    public record Where(String kind, Integer stepIndex, String operation) {

        public static Where step(int index, String operation) {
            return new Where("step", index, operation);
        }

        public static Where details() {
            return new Where("details", null, null);
        }

        public static Where input() {
            return new Where("input", null, null);
        }

        public static Where output() {
            return new Where("output", null, null);
        }
    }

    public static StoreFinding block(String code, String title, String detail, Where where) {
        return new StoreFinding(Severity.BLOCK, code, title, detail, where);
    }

    public static StoreFinding warn(String code, String title, String detail, Where where) {
        return new StoreFinding(Severity.WARN, code, title, detail, where);
    }

    public static StoreFinding info(String code, String title, String detail, Where where) {
        return new StoreFinding(Severity.INFO, code, title, detail, where);
    }

    public boolean blocks() {
        return severity == Severity.BLOCK;
    }
}
