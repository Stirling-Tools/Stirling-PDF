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
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : config.entrySet()) {
            out.put(e.getKey(), maskValue(e.getKey(), e.getValue()));
        }
        return out;
    }

    /** Drop sensitive blank/masked values from an incoming create payload. */
    public Map<String, Object> sanitize(Map<String, Object> config) {
        if (config == null) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : config.entrySet()) {
            if (isSensitive(e.getKey()) && isRedacted(e.getValue())) {
                continue;
            }
            out.put(
                    e.getKey(),
                    e.getValue() instanceof Map<?, ?> m ? sanitize(castMap(m)) : e.getValue());
        }
        return out;
    }

    /**
     * Merge an update over the stored map, keeping stored secrets where the incoming is redacted.
     */
    public Map<String, Object> merge(Map<String, Object> stored, Map<String, Object> incoming) {
        Map<String, Object> out = new LinkedHashMap<>(stored);
        for (Map.Entry<String, Object> e : incoming.entrySet()) {
            String key = e.getKey();
            Object value = e.getValue();
            if (isSensitive(key)) {
                if (!isRedacted(value)) {
                    out.put(key, value); // a real new secret replaces the stored one
                }
                continue; // redacted (blank / mask) -> keep stored
            }
            if (out.get(key) instanceof Map<?, ?> s && value instanceof Map<?, ?> i) {
                out.put(key, merge(castMap(s), castMap(i)));
            } else {
                out.put(key, value);
            }
        }
        return out;
    }

    // Sensitive key masks its whole value; recurse into non-sensitive containers.
    private Object maskValue(String key, Object value) {
        if (isSensitive(key)) {
            if (value == null || (value instanceof String s && s.isBlank())) {
                return value;
            }
            return MASK;
        }
        if (value instanceof Map<?, ?> m) {
            return mask(castMap(m));
        }
        if (value instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) {
                out.add(item instanceof Map<?, ?> m ? mask(castMap(m)) : item);
            }
            return out;
        }
        return value;
    }

    private boolean isSensitive(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return SENSITIVE_HINTS.stream().anyMatch(lower::contains);
    }

    /**
     * Blank, the mask placeholder, or any structure that still contains the mask (a re-sent value).
     */
    private boolean isRedacted(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof String s) {
            return s.isBlank() || MASK.equals(s);
        }
        if (value instanceof Map<?, ?> m) {
            return m.values().stream().anyMatch(this::isRedacted);
        }
        if (value instanceof List<?> list) {
            return list.stream().anyMatch(this::isRedacted);
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }
}
