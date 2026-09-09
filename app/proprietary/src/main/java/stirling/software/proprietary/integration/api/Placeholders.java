package stirling.software.proprietary.integration.api;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.StringNode;

/**
 * Substitutes {@code {{dotted.path}}} references against the {@link DocumentContext}.
 *
 * <p>This is what lets one step satisfy APIs that disagree about payload shape. Rather than a
 * connector per vendor, an operator writes the field names the vendor expects and fills them from
 * context - {@code {"sha256": "{{document.sha256}}", "class": "{{sensitivityLabel.name}}"}}.
 *
 * <p>Deliberately not a template language: dotted lookup and nothing else. No expressions, no
 * control flow, no method calls - a step definition is lower-trust than server config, and the
 * whole point of a template engine (evaluating what it is given) is the thing to avoid here.
 */
final class Placeholders {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([\\w.]+)\\s*}}");

    /** How a resolved value is escaped for the position it lands in. */
    enum Escaping {
        /** Verbatim: form fields and header values, which are validated separately. */
        NONE,
        /** Percent-encoded: a path segment, where a stray slash would change the target. */
        URL_PATH
    }

    private Placeholders() {}

    /**
     * @param template text that may contain {@code {{...}}} references; null passes through
     * @param context the object to resolve against
     * @throws IllegalArgumentException if a reference names something the context does not hold, so
     *     a typo surfaces as an error instead of silently sending an empty value
     */
    static String resolve(String template, JsonNode context, Escaping escaping) {
        if (template == null || template.isEmpty()) {
            return template;
        }
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String path = matcher.group(1);
            JsonNode value = lookup(context, path);
            if (value == null || value.isMissingNode()) {
                throw new IllegalArgumentException(
                        "unknown placeholder '{{"
                                + path
                                + "}}'; available: document.*, classification.*,"
                                + " sensitivityLabel.*, run.*");
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(render(value, escaping)));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /**
     * Resolve every string in a JSON tree, in place, leaving structure and non-strings alone.
     *
     * <p>This is what lets one step post an arbitrary vendor-shaped body - a nested {@code
     * documents[0].data} as readily as a flat field - without a connector per vendor.
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
            return StringNode.valueOf(resolve(node.asString(), context, Escaping.NONE));
        }
        return node;
    }

    /** Whether the text references anything at all, so callers can skip resolving. */
    static boolean hasPlaceholder(String text) {
        return text != null && PLACEHOLDER.matcher(text).find();
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

    /**
     * A null in context renders empty rather than the literal "null": absent metadata is a normal
     * state, and "null" in a vendor's field would be a value, not an absence.
     */
    private static String render(JsonNode value, Escaping escaping) {
        String text;
        if (value.isNull()) {
            text = "";
        } else if (value.isValueNode()) {
            text = value.asString();
        } else {
            // An object or array (e.g. {{classification}}) renders as its JSON.
            text = value.toString();
        }
        return escaping == Escaping.URL_PATH ? urlEncodePathSegment(text) : text;
    }

    /**
     * Encode for a path segment: a filename is the likeliest value to land in a path and may carry
     * a slash, which would otherwise read as structure rather than data.
     *
     * <p>Dots are left alone even though a traversal is made of them. Encoding them would be worse:
     * {@code %2E%2E} survives {@link java.net.URI#normalize()} and gets decoded by the target, so
     * the traversal would arrive intact and unexamined. Left raw, {@code ..} normalises here and is
     * caught by {@code ExternalApiPaths}' under-the-base check - the one place that can actually
     * see it.
     */
    private static String urlEncodePathSegment(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (byte b : text.getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xFF);
            // RFC 3986 unreserved.
            boolean unreserved =
                    (c >= 'a' && c <= 'z')
                            || (c >= 'A' && c <= 'Z')
                            || (c >= '0' && c <= '9')
                            || c == '-'
                            || c == '.'
                            || c == '_'
                            || c == '~';
            if (unreserved) {
                out.append(c);
            } else {
                out.append('%').append(String.format("%02X", b & 0xFF));
            }
        }
        return out.toString();
    }
}
