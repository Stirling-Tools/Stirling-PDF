package stirling.software.proprietary.accountlink;

/**
 * How this server was linked. A server linked with a key has no cloud sign-in in anyone's browser,
 * so its billing is managed on stirling.com rather than in the server's own pages.
 */
public enum LinkMethod {
    /** The owner signed in to Stirling Cloud and approved the link. */
    BROWSER,
    /** A key created in Stirling Cloud was redeemed, from the UI or server configuration. */
    KEY
}
