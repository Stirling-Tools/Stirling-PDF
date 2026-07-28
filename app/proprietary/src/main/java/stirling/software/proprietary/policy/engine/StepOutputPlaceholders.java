package stirling.software.proprietary.policy.engine;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.StringNode;

/**
 * Substitutes {@code {{steps.N...}}} references in a step's parameters against the reports the
 * earlier steps of the same run produced.
 *
 * <p>This is pipeline-scope resolution, and it lives here rather than in the tool because only the
 * executor can see the steps before the current one. Document- and run-scope placeholders ({@code
 * {{document.*}}}, {@code {{run.*}}}) are deliberately left untouched for the tool to resolve per
 * document; only {@code steps.*} is touched here, so the two passes never collide and neither has
 * to know the other's namespace.
 *
 * <p>Deliberately not a template language, matching the document-scope resolver: dotted lookup and
 * nothing else. A reference that names a step or field with no value fails the run rather than
 * sending an empty value, so a typo or a forward reference surfaces as an error.
 */
final class StepOutputPlaceholders {

    // Only steps.* is matched; a document/run reference is left verbatim for the downstream tool.
    private static final Pattern STEP_REF = Pattern.compile("\\{\\{\\s*(steps\\.[\\w.]+?)\\s*}}");

    private StepOutputPlaceholders() {}

    /** Whether the text references an earlier step at all, so callers can skip resolving. */
    static boolean references(String text) {
        return text != null && STEP_REF.matcher(text).find();
    }

    /**
     * @param template text that may contain {@code {{steps...}}} references; null passes through
     * @param context the run context whose {@code steps} object is keyed by 1-based step number
     * @throws IllegalArgumentException if a reference names a step or field the context does not
     *     hold, or names a non-scalar, so it cannot be inlined into a string parameter
     */
    static String resolve(String template, JsonNode context) {
        if (template == null || template.isEmpty()) {
            return template;
        }
        Matcher matcher = STEP_REF.matcher(template);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String path = matcher.group(1);
            JsonNode value = lookup(context, path);
            if (value == null || value.isMissingNode() || !value.isValueNode()) {
                throw new IllegalArgumentException(
                        "step reference '{{"
                                + path
                                + "}}' resolved to nothing; an earlier step must have produced that"
                                + " value (a later step cannot be referenced, and only scalar"
                                + " values can be inlined)");
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(value.asString()));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /**
     * Resolve every string inside a parsed JSON tree, leaving structure and non-strings alone.
     * Mirrors the document-scope resolver: a substituted value lands in a text node and is escaped
     * on serialise, so a response can never inject fields into the JSON the operator wrote.
     */
    static JsonNode resolveTree(JsonNode node, JsonNode context) {
        if (node instanceof ObjectNode object) {
            for (String name : new java.util.ArrayList<>(object.propertyNames())) {
                object.set(name, resolveTree(object.get(name), context));
            }
            return object;
        }
        if (node instanceof ArrayNode array) {
            for (int i = 0; i < array.size(); i++) {
                array.set(i, resolveTree(array.get(i), context));
            }
            return array;
        }
        if (node != null && node.isString()) {
            return StringNode.valueOf(resolve(node.asString(), context));
        }
        return node;
    }

    private static JsonNode lookup(JsonNode context, String path) {
        JsonNode node = context;
        for (String segment : path.split("\\.")) {
            if (node == null || !node.isObject()) {
                return null;
            }
            node = node.get(segment);
        }
        return node;
    }
}
