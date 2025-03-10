package stirling.software.SPDF.model;

import lombok.Getter;

@Getter
public enum UsernameAttribute {
    MAIL("mail"),
    EMAIL("email"),
    LOGIN("login"),
    PROFILE("profile"),
    NAME("name"),
    UID("uid"),
    USERNAME("username"),
    NICKNAME("nickname"),
    GIVEN_NAME("given_name"),
    MIDDLE_NAME("middle_name"),
    FAMILY_NAME("family_name"),
    PREFERRED_NAME("preferred_name"),
    PREFERRED_USERNAME("preferred_username");

    private final String name;

    UsernameAttribute(final String name) {
        this.name = name;
    }
}
