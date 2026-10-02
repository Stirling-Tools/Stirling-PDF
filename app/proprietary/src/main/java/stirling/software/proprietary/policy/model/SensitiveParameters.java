package stirling.software.proprietary.policy.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Which step settings hold secrets, judged on the setting's name: its camelCase, snake_case or
 * kebab-case words are matched against single words ("password", "token") and word pairs ("api
 * key", "connection id"), so {@code ownerPassword} and {@code api_key} are secrets and {@code
 * keyLength} is not.
 *
 * <p>One definition for both sides of the pipeline store: the SaaS sanitiser clears these from
 * every published manifest, and a self-hosted server blanks them before a pipeline leaves it for
 * publishing, so a password is never sent to be stripped somewhere else.
 */
public final class SensitiveParameters {

    private static final Set<String> SENSITIVE_WORDS =
            Set.of(
                    "password",
                    "passphrase",
                    "token",
                    "secret",
                    "secrets",
                    "authorization",
                    "auth",
                    "jwt",
                    "cred",
                    "credential",
                    "credentials",
                    "cert",
                    "certificate",
                    "pin",
                    "otp");

    private static final Set<String> SENSITIVE_PAIRS =
            Set.of(
                    "api key",
                    "access key",
                    "secret key",
                    "private key",
                    "signing secret",
                    "client secret",
                    "shared secret",
                    "connection id",
                    "webhook id",
                    "account key",
                    "license key");

    private static final Pattern WORD_BREAKS =
            Pattern.compile("(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\\-.\\s]+");

    private SensitiveParameters() {}

    public static boolean isSensitiveKey(String key) {
        if (key == null || key.isBlank()) {
            return false;
        }
        List<String> words = new ArrayList<>();
        for (String word : WORD_BREAKS.split(key)) {
            if (!word.isBlank()) {
                words.add(word.toLowerCase(Locale.ROOT));
            }
        }
        for (String word : words) {
            if (SENSITIVE_WORDS.contains(word)) {
                return true;
            }
        }
        for (int i = 0; i + 1 < words.size(); i++) {
            if (SENSITIVE_PAIRS.contains(words.get(i) + " " + words.get(i + 1))) {
                return true;
            }
        }
        return false;
    }

    /**
     * The settings with every secret's value replaced by an empty string. The key stays, so whoever
     * reads the copy still knows the setting exists and needs a value.
     */
    public static Map<String, Object> blanked(Map<String, Object> parameters) {
        Map<String, Object> out = new LinkedHashMap<>();
        parameters.forEach((key, value) -> out.put(key, isSensitiveKey(key) ? "" : value));
        return out;
    }
}
