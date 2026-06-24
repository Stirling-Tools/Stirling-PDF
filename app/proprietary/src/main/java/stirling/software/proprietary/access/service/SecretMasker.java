package stirling.software.proprietary.access.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

/** Masks, merges and sanitizes secret values in a config map, recursing into nested maps/lists. */
@Component
public class SecretMasker {

    public static final String MASK = "********";

    // Cap recursion so a pathologically nested payload cannot overflow the stack.
    private static final int MAX_DEPTH = 32;

    private static final Set<String> SENSITIVE_HINTS =
            Set.of(
                    "secret",
                    "password",
                    "token",
                    "apikey",
                    "accesskey",
                    "credential",
                    "privatekey");

    /** Replace sensitive values with the mask (recursively) for safe display. */
    public Map<String, Object> mask(Map<String, Object> config) {
        return mask(config, 0);
    }

    /** Drop sensitive blank/masked values from an incoming create payload. */
    public Map<String, Object> sanitize(Map<String, Object> config) {
        return sanitize(config, 0);
    }

    /**
     * Merge an update over the stored map, keeping stored secrets where the incoming is redacted.
     */
    public Map<String, Object> merge(Map<String, Object> stored, Map<String, Object> incoming) {
        return merge(stored, incoming, 0);
    }

    private Map<String, Object> mask(Map<String, Object> config, int depth) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : config.entrySet()) {
            out.put(e.getKey(), maskValue(e.getKey(), e.getValue(), depth));
        }
        return out;
    }

    private Map<String, Object> sanitize(Map<String, Object> config, int depth) {
        if (config == null) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : config.entrySet()) {
            if (isSensitive(e.getKey()) && isRedacted(e.getValue(), depth)) {
                continue;
            }
            out.put(
                    e.getKey(),
                    e.getValue() instanceof Map<?, ?> m && depth < MAX_DEPTH
                            ? sanitize(castMap(m), depth + 1)
                            : e.getValue());
        }
        return out;
    }

    private Map<String, Object> merge(
            Map<String, Object> stored, Map<String, Object> incoming, int depth) {
        Map<String, Object> out = new LinkedHashMap<>(stored);
        for (Map.Entry<String, Object> e : incoming.entrySet()) {
            String key = e.getKey();
            Object value = e.getValue();
            if (isSensitive(key)) {
                if (!isRedacted(value, depth)) {
                    out.put(key, value); // a real new secret replaces the stored one
                }
                continue; // redacted (blank / mask) -> keep stored
            }
            if (depth < MAX_DEPTH
                    && out.get(key) instanceof Map<?, ?> s
                    && value instanceof Map<?, ?> i) {
                out.put(key, merge(castMap(s), castMap(i), depth + 1));
            } else {
                out.put(key, value);
            }
        }
        return out;
    }

    // A sensitive key masks its whole value; recurse into non-sensitive containers.
    private Object maskValue(String key, Object value, int depth) {
        if (isSensitive(key)) {
            if (value == null || (value instanceof String s && s.isBlank())) {
                return value;
            }
            return MASK;
        }
        if (depth >= MAX_DEPTH) {
            // Too deep to descend; mask containers rather than risk leaking an unmasked secret.
            return value instanceof Map<?, ?> || value instanceof List<?> ? MASK : value;
        }
        if (value instanceof Map<?, ?> m) {
            return mask(castMap(m), depth + 1);
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) {
                out.add(item instanceof Map<?, ?> m ? mask(castMap(m), depth + 1) : item);
            }
            return out;
        }
        return value;
    }

    private boolean isSensitive(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return SENSITIVE_HINTS.stream().anyMatch(lower::contains);
    }

    /** Blank, the mask placeholder, or any structure that still contains the mask. */
    private boolean isRedacted(Object value, int depth) {
        if (value == null) {
            return true;
        }
        if (value instanceof String s) {
            return s.isBlank() || MASK.equals(s);
        }
        if (depth >= MAX_DEPTH) {
            return false;
        }
        if (value instanceof Map<?, ?> m) {
            return m.values().stream().anyMatch(v -> isRedacted(v, depth + 1));
        }
        if (value instanceof List<?> list) {
            return list.stream().anyMatch(v -> isRedacted(v, depth + 1));
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }
}
