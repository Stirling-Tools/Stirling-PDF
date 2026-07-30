package stirling.software.common.model.tool;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The runtime form of a {@link ToolIO} declaration, read off a handler method once at startup and
 * shared by everything that needs it: the chain validator, the pipeline executors, and the OpenAPI
 * emission that carries it to the frontend and the AI engine.
 */
public record ToolIOSpec(
        Set<ToolFormat> accepts, ToolFormat produces, ToolArity arity, List<Case> cases) {

    /** One condition on a parameter, with its match values normalised for comparison. */
    public record When(String param, List<String> matches) {

        boolean holdsFor(Object value) {
            String normalised =
                    value == null ? "" : String.valueOf(value).trim().toLowerCase(Locale.ROOT);
            return matches.contains(normalised);
        }
    }

    /** One {@link ToolIOCase}: an output that applies when every condition holds. */
    public record Case(List<When> when, ToolFormat produces, ToolArity arity) {

        public Case {
            when = List.copyOf(when);
        }
    }

    /**
     * A step's output. {@code certain} is false when a {@link Case} keys on a parameter whose value
     * is not known yet, which happens while a pipeline is being edited; callers downgrade to a
     * warning rather than guessing.
     */
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
        List<String> matches =
                Arrays.stream(condition.matches())
                        .map(value -> value.trim().toLowerCase(Locale.ROOT))
                        .toList();
        return new When(condition.param(), matches);
    }

    /**
     * The output for a step configured with {@code parameters}. The first matching {@link Case}
     * wins. If no rule matches but one keys on a parameter we cannot see, the declaration's own
     * output is returned as uncertain, since a value we never saw might have selected a different
     * branch.
     *
     * @param parameters the step's configured parameters, or null when they are not known
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

    /** The output when nothing is known about the step's parameters. */
    public Output resolveOutput() {
        return resolveOutput(null);
    }

    /** True if this endpoint can be handed a file of {@code format}. */
    public boolean acceptsFormat(ToolFormat format) {
        return format == ToolFormat.ANY
                || accepts.contains(ToolFormat.ANY)
                || accepts.contains(format);
    }

    /** The input extensions for run-time file checking, or empty when anything is accepted. */
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
