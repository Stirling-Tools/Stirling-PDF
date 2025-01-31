package stirling.software.SPDF.model;

import lombok.Getter;

@Getter
public enum UsernameAttribute {
    NAME("name"),
    EMAIL("email"),
    GIVEN_NAME("given_name"),
    PREFERRED_NAME("preferred_name"),
    PREFERRED_USERNAME("preferred_username"),
    LOGIN("login"),
    FAMILY_NAME("family_name"),
    NICKNAME("nickname");

    private final String name;

    UsernameAttribute(final String name) {
        this.name = name;
    }
}
