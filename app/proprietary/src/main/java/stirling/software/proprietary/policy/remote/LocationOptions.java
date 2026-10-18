package stirling.software.proprietary.policy.remote;

import java.util.Map;

/**
 * Option parsing shared by the cloud locations: the processing mode, folder depth, and a folder
 * path that cannot climb out of where its location was scoped.
 */
public final class LocationOptions {

    private LocationOptions() {}

    /** Whether "mode" is snapshot; "consume" (the default) and "track" are not. */
    public static boolean snapshot(Map<String, Object> options) {
        String mode = trimmed(options.get("mode"));
        if (mode == null) {
            return false;
        }
        return switch (mode) {
            case "consume", "track" -> false;
            case "snapshot" -> true;
            default ->
                    throw new IllegalArgumentException(
                            "'mode' must be 'consume', 'track' or 'snapshot'");
        };
    }

    public static boolean recursive(Map<String, Object> options) {
        return Boolean.parseBoolean(String.valueOf(options.get("recursive")).trim());
    }

    /**
     * A relative folder path with slashes normalised and no leading or trailing slash; {@code ..}
     * and {@code .} segments are rejected so a location stays where it was scoped.
     */
    public static String folderPath(String text) {
        String normalized = text.replace('\\', '/');
        for (String segment : normalized.split("/")) {
            if (segment.equals("..") || segment.equals(".")) {
                throw new IllegalArgumentException("folder must not contain '.' or '..' segments");
            }
            if (segment.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("folder contains a null character");
            }
        }
        return trimSlashes(normalized.replaceAll("/{2,}", "/"));
    }

    public static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    public static String trimSlashes(String value) {
        int start = 0;
        int end = value.length();
        while (start < end && value.charAt(start) == '/') {
            start++;
        }
        while (end > start && value.charAt(end - 1) == '/') {
            end--;
        }
        return value.substring(start, end);
    }
}
