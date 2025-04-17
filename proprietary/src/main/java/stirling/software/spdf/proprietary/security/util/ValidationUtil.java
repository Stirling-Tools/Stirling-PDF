package stirling.software.spdf.proprietary.security.util;

import java.util.Collection;

import stirling.software.spdf.proprietary.security.model.provider.Provider;

public class ValidationUtil {

    public static boolean validateProvider(Provider provider) {
        if (provider == null) {
            return false;
        }

        if (isStringEmpty(provider.getClientId())) {
            return false;
        }

        if (isStringEmpty(provider.getClientSecret())) {
            return false;
        }

        if (isCollectionEmpty(provider.getScopes())) {
            return false;
        }

        return true;
    }

    public static boolean isStringEmpty(String input) {
        return input == null || input.isBlank();
    }

    public static boolean isCollectionEmpty(Collection<String> input) {
        return input == null || input.isEmpty();
    }
}
