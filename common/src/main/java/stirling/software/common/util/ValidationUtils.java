package stirling.software.common.util;

import java.util.Collection;

public class ValidationUtils {

    public static boolean isStringEmpty(String input) {
        return input == null || input.isBlank();
    }

    public static boolean isCollectionEmpty(Collection<String> input) {
        return input == null || input.isEmpty();
    }
}
