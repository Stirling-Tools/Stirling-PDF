package stirling.software.common.util;

<<<<<<<< HEAD:common/src/main/java/stirling/software/common/util/ProviderUtils.java
import static stirling.software.common.util.ValidationUtils.isCollectionEmpty;
import static stirling.software.common.util.ValidationUtils.isStringEmpty;

import stirling.software.common.model.oauth2.Provider;

public class ProviderUtils {
========
import stirling.software.common.model.provider.Provider;
import static stirling.software.common.util.ValidationUtil.isCollectionEmpty;
import static stirling.software.common.util.ValidationUtil.isStringEmpty;

public class ProviderUtil {
>>>>>>>> 7d4baf22 (renaming module):common/src/main/java/stirling/software/common/util/ProviderUtil.java

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
