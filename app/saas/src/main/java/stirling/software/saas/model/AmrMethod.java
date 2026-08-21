package stirling.software.saas.model;

/**
 * Supabase JWT {@code amr} claim values: the authentication methods Supabase records when a user
 * logs in. Used during anonymous-to-authenticated upgrades to record how the user upgraded.
 */
public enum AmrMethod {
    OAUTH("oauth"),
    PASSWORD("password"),
    OTP("otp"),
    TOTP("totp"),
    RECOVERY("recovery"),
    INVITE("invite"),
    SSO_SAML("sso/saml"),
    MAGICLINK("magiclink"),
    EMAIL_SIGNUP("email/signup"),
    EMAIL_CHANGE("email_change"),
    TOKEN_REFRESH("token_refresh"),
    ANONYMOUS("anonymous");

    private final String method;

    AmrMethod(String method) {
        this.method = method;
    }

    public String getMethod() {
        return method;
    }
}
