package stirling.software.common.util;

import java.util.Collection;
import stirling.software.common.model.provider.Provider;

public class ValidationUtil {

    public static boolean isStringEmpty(String input) {
        return input == null || input.isBlank();
    }

    public static boolean isCollectionEmpty(Collection<String> input) {
        return input == null || input.isEmpty();
    }
}
