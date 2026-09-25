package stirling.software.common.model.tool;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** The runtime form of a {@link ToolIO} declaration, read off a handler method once at startup. */
public record ToolIOSpec(
        Set<ToolFormat> accepts, ToolFormat produces, ToolArity arity, List<Case> cases) {

    /**
     * @param paramDefault the value used when the parameter is absent, or null when it has no
     *     default - an absent parameter then leaves the case unresolved rather than defaulted.
     */
    public record When(String param, List<String> matches, String paramDefault) {

        boolean holdsFor(Object value) {
            String normalised = normalise(value);
            return matches.stream().anyMatch(match -> normalise(match).equals(normalised));
        }
    }

    /** Supplies the default value a request parameter takes when a caller omits it. */
    @FunctionalInterface
    public interface ParameterDefaults {
        Optional<String> defaultFor(String param);

        ParameterDefaults NONE = param -> Optional.empty();
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
        return from(annotation, ParameterDefaults.NONE);
    }

    public static ToolIOSpec from(ToolIO annotation, ParameterDefaults defaults) {
        return new ToolIOSpec(
                new LinkedHashSet<>(Arrays.asList(annotation.accepts())),
                annotation.produces(),
                annotation.arity(),
                Arrays.stream(annotation.cases()).map(rule -> toCase(rule, defaults)).toList());
    }

    private static Case toCase(ToolIOCase rule, ParameterDefaults defaults) {
        List<When> when = Arrays.stream(rule.when()).map(c -> toWhen(c, defaults)).toList();
        return new Case(when, rule.produces(), rule.arity());
    }

    private static When toWhen(ToolIOWhen condition, ParameterDefaults defaults) {
        return new When(
                condition.param(),
                List.of(condition.matches()),
                defaults.defaultFor(condition.param()).orElse(null));
    }

    /**
     * First matching {@link Case} wins. A parameter the caller omitted resolves to its declared
     * default; only a parameter with no default leaves the output uncertain, since an unseen value
     * might then have picked another branch.
     *
     * @param parameters the step's configured parameters, or null when not known
     */
    public Output resolveOutput(Map<String, Object> parameters) {
        boolean sawUnknownParam = false;
        for (Case rule : cases) {
            boolean allHold = true;
            for (When condition : rule.when()) {
                Object value;
                if (parameters != null && parameters.containsKey(condition.param())) {
                    value = parameters.get(condition.param());
                } else if (condition.paramDefault() != null) {
                    value = condition.paramDefault();
                } else {
                    sawUnknownParam = true;
                    allHold = false;
                    continue;
                }
                allHold &= condition.holdsFor(value);
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
