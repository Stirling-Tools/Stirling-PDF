package stirling.software.proprietary.util;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import lombok.extern.slf4j.Slf4j;

/** Redacts any map values whose keys match common secret/token patterns. */
@Slf4j
public final class SecretMasker {

    private static final Pattern SENSITIVE =
            Pattern.compile(
                    "(?i)(password|token|secret|api[_-]?key|authorization|auth|jwt|cred|cert)");

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
            return "***REDACTED***";
        }
        return deepMask(value);
    }
}
