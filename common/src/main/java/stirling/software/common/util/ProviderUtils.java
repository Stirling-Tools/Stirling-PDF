package stirling.software.common.util;

import stirling.software.common.model.oauth2.Provider;
import static stirling.software.common.util.ValidationUtils.isCollectionEmpty;
import static stirling.software.common.util.ValidationUtils.isStringEmpty;

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
