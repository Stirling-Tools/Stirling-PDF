package stirling.software.proprietary.util;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Redacts any map values whose keys match common secret/token patterns. */
public final class SecretMasker {

    private static final Pattern SENSITIVE =
        Pattern.compile("(?i)(password|token|secret|api[_-]?key|authorization|auth|jwt|cred|cert)");

    private SecretMasker() {}

    public static Map<String, Object> mask(Map<String, Object> in) {
        if (in == null) {
            return null;
        }

        Map<String, Object> result = new HashMap<>(in.size());
        
        for (Map.Entry<String, Object> entry : in.entrySet()) {
            String key = entry.getKey();
            if (key != null && SENSITIVE.matcher(key).find()) {
                result.put(key, "***REDACTED***");
            } else {
                result.put(key, entry.getValue());
            }
        }
        
        return result;
    }
}