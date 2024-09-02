package stirling.software.SPDF.utils;

import java.util.List;

public class PropertyConfigs {

    public static boolean getBooleanValue(List<String> keys, boolean defaultValue) {
        for (String key : keys) {
            String value = System.getProperty(key);
            if (value == null) value = System.getenv(key);

            if (value != null) return Boolean.valueOf(value);
        }
        return defaultValue;
    }

    public static String getStringValue(List<String> keys, String defaultValue) {
        for (String key : keys) {
            String value = System.getProperty(key);
            if (value == null) value = System.getenv(key);

            if (value != null) return value;
        }
        return defaultValue;
    }

    public static boolean getBooleanValue(String key, boolean defaultValue) {
        String value = System.getProperty(key);
        if (value == null) value = System.getenv(key);
        return (value != null) ? Boolean.valueOf(value) : defaultValue;
    }

    public static String getStringValue(String key, String defaultValue) {
        String value = System.getProperty(key);
        if (value == null) value = System.getenv(key);
        return (value != null) ? value : defaultValue;
    }
}
