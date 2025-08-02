package stirling.software.proprietary.security.model;

public enum AuthenticationType {
    WEB,
    @Deprecated(since = "1.0.2")
    SSO,
    OAUTH2,
    SAML2
}
