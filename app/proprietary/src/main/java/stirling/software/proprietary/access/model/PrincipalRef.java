package stirling.software.proprietary.access.model;

import java.util.Locale;

/** A (type, id) principal pair; the atom grants and ownership are expressed in. */
public record PrincipalRef(PrincipalType type, Long id) {

    public static PrincipalRef user(Long id) {
        return new PrincipalRef(PrincipalType.USER, id);
    }

    public static PrincipalRef team(Long id) {
        return new PrincipalRef(PrincipalType.TEAM, id);
    }

    /** Canonical engine wire form, e.g. "user:12". */
    public String token() {
        return type.name().toLowerCase(Locale.ROOT) + ":" + id;
    }
}
