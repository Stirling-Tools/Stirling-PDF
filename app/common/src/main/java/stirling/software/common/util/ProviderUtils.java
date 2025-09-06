package stirling.software.common.util;

import static stirling.software.common.util.ValidationUtils.isCollectionEmpty;
import static stirling.software.common.util.ValidationUtils.isStringEmpty;

import stirling.software.common.model.oauth2.Provider;

public class ProviderUtils {

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
}
