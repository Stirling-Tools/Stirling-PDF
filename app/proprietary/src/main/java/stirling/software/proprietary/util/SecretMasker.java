package stirling.software.proprietary.util;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RegexPatternUtils;

/** Redacts any map values whose keys match common secret/token patterns. */
@Slf4j
public final class SecretMasker {

    /** The placeholder masked values are replaced with; reads as "a secret is set". */
    public static final String REDACTED = "********";

    private static final Pattern SENSITIVE =
            RegexPatternUtils.getInstance()
                    .getPattern(
                            // secret[_-]?access[_-]?key precedes plain secret so camelCase keys
                            // like secretAccessKey (no word boundary after "secret") still match.
                            "(?i)\\b(password|token|secret[_-]?access[_-]?key|signing[_-]?secret|secret|api[_-]?key|authorization|auth|jwt|cred|cert)\\b");

    private SecretMasker() {}

    public static Map<String, Object> mask(Map<String, Object> in) {
        if (in == null) return null;

        return in.entrySet().stream()
                .filter(e -> e.getValue() != null)
                .collect(
                        Collectors.toMap(
                                Map.Entry::getKey, e -> deepMaskValue(e.getKey(), e.getValue())));
    }

    private static Object deepMask(Object value) {
        if (value instanceof Map<?, ?> m) {
            return m.entrySet().stream()
                    .filter(e -> e.getValue() != null)
                    .collect(
                            Collectors.toMap(
                                    Map.Entry::getKey,
                                    e -> deepMaskValue((String) e.getKey(), e.getValue())));
        } else if (value instanceof List<?> list) {
            return list.stream().map(SecretMasker::deepMask).toList();
        } else {
            return value;
        }
    }

    private static Object deepMaskValue(String key, Object value) {
        if (key != null && SENSITIVE.matcher(key).find()) {
            return REDACTED;
        }
        return deepMask(value);
    }

    /**
     * Restore top-level values the caller sent back as the {@link #REDACTED} sentinel from the
     * stored map, so a masked read can round-trip through an edit without re-typing secrets. A
     * sentinel with no stored counterpart is left as-is (it fails whatever validates it, rather
     * than silently passing an unset secret).
     */
    public static Map<String, Object> restoreRedacted(
            Map<String, Object> incoming, Map<String, Object> stored) {
        if (incoming == null || stored == null) {
            return incoming;
        }
        Map<String, Object> merged = new LinkedHashMap<>(incoming);
        merged.replaceAll(
                (key, value) ->
                        REDACTED.equals(value) && stored.containsKey(key)
                                ? stored.get(key)
                                : value);
        return merged;
    }
}
