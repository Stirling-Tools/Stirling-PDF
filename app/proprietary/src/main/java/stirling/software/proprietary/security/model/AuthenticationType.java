package stirling.software.proprietary.security.model;

public enum AuthenticationType {
    WEB,
    @Deprecated(since = "1.0.2")
    SSO,
    OAUTH2,
    SAML2,
    /** Supabase anonymous session. Saas profile only, no email yet. */
    ANONYMOUS
}
