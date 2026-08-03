package stirling.software.common.model.tool;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** The runtime form of a {@link ToolIO} declaration, read off a handler method once at startup. */
public record ToolIOSpec(
        Set<ToolFormat> accepts, ToolFormat produces, ToolArity arity, List<Case> cases) {

    public record When(String param, List<String> matches) {

        boolean holdsFor(Object value) {
            String normalised = normalise(value);
            return matches.stream().anyMatch(match -> normalise(match).equals(normalised));
        }
    }

    /**
     * Both sides of a condition are normalised at comparison, not at construction: the declaration
     * reaches the frontend and the engine as published data, and normalising only one side there
     * would silently disagree with this one.
     */
    public static String normalise(Object value) {
        return value == null ? "" : String.valueOf(value).trim().toLowerCase(Locale.ROOT);
    }

    public record Case(List<When> when, ToolFormat produces, ToolArity arity) {

        public Case {
            when = List.copyOf(when);
        }
    }

    /** {@code certain} is false when a {@link Case} keys on a parameter whose value is unknown. */
    public record Output(ToolFormat format, ToolArity arity, boolean certain) {}

    public ToolIOSpec {
        accepts = Set.copyOf(accepts);
        cases = List.copyOf(cases);
    }

    public static ToolIOSpec from(ToolIO annotation) {
        return new ToolIOSpec(
                new LinkedHashSet<>(Arrays.asList(annotation.accepts())),
                annotation.produces(),
                annotation.arity(),
                Arrays.stream(annotation.cases()).map(ToolIOSpec::toCase).toList());
    }

    private static Case toCase(ToolIOCase rule) {
        List<When> when = Arrays.stream(rule.when()).map(ToolIOSpec::toWhen).toList();
        return new Case(when, rule.produces(), rule.arity());
    }

    private static When toWhen(ToolIOWhen condition) {
        return new When(condition.param(), List.of(condition.matches()));
    }

    /**
     * First matching {@link Case} wins. If none match but one reads a parameter we cannot see, the
     * declared output comes back uncertain: a value we never saw might have picked another branch.
     *
     * @param parameters the step's configured parameters, or null when not known
     */
    public Output resolveOutput(Map<String, Object> parameters) {
        boolean sawUnknownParam = false;
        for (Case rule : cases) {
            boolean allHold = true;
            for (When condition : rule.when()) {
                if (parameters == null || !parameters.containsKey(condition.param())) {
                    sawUnknownParam = true;
                    allHold = false;
                    continue;
                }
                allHold &= condition.holdsFor(parameters.get(condition.param()));
            }
            if (allHold) {
                return new Output(rule.produces(), rule.arity(), true);
            }
        }
        return new Output(produces, arity, !sawUnknownParam);
    }

    public Output resolveOutput() {
        return resolveOutput(null);
    }

    public boolean acceptsFormat(ToolFormat format) {
        return format == ToolFormat.ANY
                || accepts.contains(ToolFormat.ANY)
                || accepts.contains(format);
    }

    /** For run-time file checks. Empty means anything is accepted. */
    public List<String> acceptedExtensions() {
        if (accepts.contains(ToolFormat.ANY)) {
            return List.of();
        }
        return accepts.stream()
                .flatMap(format -> format.getExtensions().stream())
                .distinct()
                .toList();
    }
}
