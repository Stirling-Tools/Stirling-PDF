package stirling.software.proprietary.security.util;

import java.util.Locale;
import java.util.Set;

import stirling.software.common.util.RegexPatternUtils;

/**
 * The names an account may be stored under: a plain username, or an email address. Authority for
 * {@code UserService.saveUserCore}, which throws when it is not satisfied, so any gate that decides
 * an account can be created later must agree with this or it promises an account the writer will
 * refuse.
 */
public final class UsernameRules {

    private static final Set<String> RESERVED = Set.of("all_users", "anonymoususer");

    private UsernameRules() {}

    public static boolean isValid(String username) {
        if (username == null) {
            return false;
        }
        RegexPatternUtils patterns = RegexPatternUtils.getInstance();
        boolean matchesShape =
                patterns.getUsernameValidationPattern().matcher(username).matches()
                        || patterns.getEmailValidationPattern().matcher(username).matches();
        return matchesShape && !RESERVED.contains(username.toLowerCase(Locale.ROOT));
    }
}
