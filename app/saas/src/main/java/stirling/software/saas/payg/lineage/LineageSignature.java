package stirling.software.saas.payg.lineage;

import java.util.Objects;

/**
 * A single identity signal for a piece of content. The detector treats {@code (type, value)} as an
 * opaque equality key — two signatures match if both components are equal. Format:
 *
 * <ul>
 *   <li>{@code type} describes the extraction strategy ({@code "sha256"}, {@code "pdf-id"}, {@code
 *       "pdf-content-stream-hash"}, etc.).
 *   <li>{@code value} is the strategy-specific identifier, encoded as a string short enough to fit
 *       in {@code job_artifact_hash.content_hash} (VARCHAR(128)).
 * </ul>
 *
 * <p>Persisted as the concatenation {@code "{type}:{value}"} so multiple signature types can
 * coexist on the same {@code job_artifact_hash} table without a separate column.
 */
public record LineageSignature(String type, String value) {

    public LineageSignature {
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(value, "value");
        if (type.isBlank()) {
            throw new IllegalArgumentException("signature type must not be blank");
        }
        if (type.contains(":")) {
            throw new IllegalArgumentException("signature type must not contain ':'");
        }
        if (value.isBlank()) {
            throw new IllegalArgumentException("signature value must not be blank");
        }
    }

    /** Storage form: {@code "type:value"}. */
    public String asStorageKey() {
        return type + ":" + value;
    }

    /** Parses a storage-form key back into a {@code LineageSignature}. */
    public static LineageSignature fromStorageKey(String key) {
        Objects.requireNonNull(key, "key");
        int colon = key.indexOf(':');
        if (colon <= 0 || colon == key.length() - 1) {
            throw new IllegalArgumentException(
                    "Storage key must be of the form 'type:value': " + key);
        }
        return new LineageSignature(key.substring(0, colon), key.substring(colon + 1));
    }
}
