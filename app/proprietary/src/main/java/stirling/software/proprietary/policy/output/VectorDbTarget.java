package stirling.software.proprietary.policy.output;

import java.util.Map;
import java.util.Set;

import stirling.software.proprietary.integration.api.ApiConnectionResolver;

/** A pre-existing vector collection and its text field. */
public record VectorDbTarget(
        long connectionId, String collection, String namespace, String textField) {
    public static VectorDbTarget from(Map<String, Object> options) {
        Long id = ApiConnectionResolver.connectionId(options.get("connectionId"));
        if (id == null) {
            throw new IllegalArgumentException("Vector database source requires a connection");
        }
        String collection = value(options, "collection", "");
        String namespace = value(options, "namespace", "__default__");
        String textField = value(options, "textField", "text");
        if (!collection.matches("[A-Za-z][A-Za-z0-9_-]{0,254}")) {
            throw new IllegalArgumentException("Enter a valid collection or index name");
        }
        if (namespace.length() > 512) {
            throw new IllegalArgumentException("Namespace must be at most 512 characters");
        }
        if (!textField.matches("[a-zA-Z][a-zA-Z0-9_]{0,127}")
                || Set.of("id", "documentId", "chunkIndex", "pageStart", "pageEnd", "headingPath")
                        .contains(textField)) {
            throw new IllegalArgumentException(
                    "Choose a text field distinct from the chunk metadata fields");
        }
        return new VectorDbTarget(id, collection, namespace, textField);
    }

    private static String value(Map<String, Object> options, String key, String fallback) {
        Object raw = options.get(key);
        return raw == null || raw.toString().isBlank() ? fallback : raw.toString().trim();
    }
}
