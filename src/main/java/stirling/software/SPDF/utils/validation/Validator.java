package stirling.software.SPDF.utils.validation;

import java.util.Collection;

import stirling.software.SPDF.model.provider.Provider;

public class Validator {

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
