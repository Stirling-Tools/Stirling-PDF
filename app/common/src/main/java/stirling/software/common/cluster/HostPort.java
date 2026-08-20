package stirling.software.common.cluster;

/**
 * One {@code host:port} entry from a Valkey cluster or sentinel node list. Shared by config
 * validation and by the connection builder so the two can never disagree on what a valid entry is.
 */
public record HostPort(String host, int port) {

    /**
     * The port is always explicit: a bare host would silently take a default and connect somewhere
     * the operator never named. IPv6 literals must be bracketed ({@code [::1]:6379}).
     *
     * @throws IllegalStateException naming {@code propertyName} and echoing {@code entry}
     */
    public static HostPort parse(String entry, String propertyName, String example) {
        String trimmed = entry == null ? "" : entry.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalStateException(
                    propertyName
                            + " contains a blank entry (expected host:port, e.g. "
                            + example
                            + ").");
        }
        if (trimmed.charAt(0) == '[') {
            return parseBracketed(trimmed, entry, propertyName, example);
        }
        int colon = trimmed.lastIndexOf(':');
        if (colon < 0) {
            throw reject(entry, propertyName, example, "is not host:port");
        }
        if (trimmed.indexOf(':') != colon) {
            throw reject(
                    entry,
                    propertyName,
                    example,
                    "has more than one ':' - bracket IPv6 literals as [::1]:6379");
        }
        return build(
                trimmed.substring(0, colon),
                trimmed.substring(colon + 1),
                entry,
                propertyName,
                example);
    }

    /** Handles {@code [::1]:6379}; the returned host keeps no brackets. */
    private static HostPort parseBracketed(
            String trimmed, String entry, String propertyName, String example) {
        int close = trimmed.indexOf(']');
        if (close < 0) {
            throw reject(entry, propertyName, example, "has an unclosed '['");
        }
        String rest = trimmed.substring(close + 1);
        if (rest.isEmpty() || rest.charAt(0) != ':') {
            throw reject(entry, propertyName, example, "is not host:port");
        }
        return build(trimmed.substring(1, close), rest.substring(1), entry, propertyName, example);
    }

    private static HostPort build(
            String host, String rawPort, String entry, String propertyName, String example) {
        int port;
        try {
            port = Integer.parseInt(rawPort);
        } catch (NumberFormatException ex) {
            throw new IllegalStateException(
                    message(entry, propertyName, example, "is not host:port"), ex);
        }
        if (host.isBlank() || port < 1 || port > 65535) {
            throw reject(entry, propertyName, example, "is not host:port");
        }
        return new HostPort(host, port);
    }

    private static IllegalStateException reject(
            String entry, String propertyName, String example, String problem) {
        return new IllegalStateException(message(entry, propertyName, example, problem));
    }

    private static String message(
            String entry, String propertyName, String example, String problem) {
        return propertyName + " entry '" + entry + "' " + problem + " (e.g. " + example + ").";
    }
}
