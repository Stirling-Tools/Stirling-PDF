package stirling.software.saas.util;

import java.util.UUID;

/** PII redaction helpers for log lines. */
public final class LogRedactionUtils {

    private LogRedactionUtils() {}

    /** Mask an email as {@code j***@stirling.com}; non-email input is returned unchanged. */
    public static String redactEmail(String email) {
        if (email == null || email.isBlank()) {
            return email;
        }
        int at = email.indexOf('@');
        if (at <= 0 || at == email.length() - 1) {
            return email;
        }
        return email.charAt(0) + "***" + email.substring(at);
    }

    /** Mask a Supabase UUID as {@code 12345678-***-abcd}; short input is returned unchanged. */
    public static String redactSupabaseId(String supabaseId) {
        if (supabaseId == null || supabaseId.length() < 12) {
            return supabaseId;
        }
        return supabaseId.substring(0, 8) + "-***-" + supabaseId.substring(supabaseId.length() - 4);
    }

    /** UUID overload. */
    public static String redactSupabaseId(UUID supabaseId) {
        return supabaseId == null ? null : redactSupabaseId(supabaseId.toString());
    }
}
