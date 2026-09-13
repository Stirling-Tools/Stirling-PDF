package stirling.software.proprietary.security.model;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

public enum LoginLandingView {
    EDITOR,
    PROCESSOR;

    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Optional<LoginLandingView> parse(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String trimmed = value.trim();
        return Arrays.stream(values())
                .filter(view -> view.name().equalsIgnoreCase(trimmed))
                .findFirst();
    }
}
