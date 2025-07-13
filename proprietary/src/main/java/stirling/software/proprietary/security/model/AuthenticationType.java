package stirling.software.proprietary.security.model;

public enum AuthenticationType {
    WEB,
    SSO,
    // TODO: Worth making a distinction between OAuth2 and SAML2?
    OAUTH2,
    SAML2
}
