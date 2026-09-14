package stirling.software.saas.accountlink;

/**
 * Origin formatting shared by the connect handshake.
 *
 * <p>One place on purpose: the origin a request arrives on and the origin parsed out of a callback
 * URL are compared with each other, so if either side stopped omitting the default port the
 * comparison would start failing quietly.
 */
final class Origins {

    private Origins() {}

    /** {@code host} or {@code host:port}, dropping a port that is the scheme's default. */
    static String hostPort(String scheme, String host, int port) {
        boolean isDefault =
                port <= 0
                        || ("http".equals(scheme) && port == 80)
                        || ("https".equals(scheme) && port == 443);
        return isDefault ? host : host + ":" + port;
    }
}
