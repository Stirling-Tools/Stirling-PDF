package stirling.software.proprietary.security.saml2.config;

import org.eclipse.microprofile.config.Config;

/**
 * Snapshot of the SAML2 SP configuration, read from MicroProfile config (the {@code
 * SECURITY_SAML2_*} env vars the compose sets). Property names mirror the exact env names so
 * SmallRye's env mapping resolves them (the compose mixes {@code IDP_ISSUER}-style and {@code
 * IDPSINGLELOGINURL}-style).
 */
public record SamlConfig(
        String registrationId,
        String spEntityId,
        String acsUrl,
        String idpSingleLoginUrl,
        String idpIssuer,
        String idpCertPath,
        String spCertPath,
        String privateKeyPath,
        boolean autoCreateUser) {

    public static SamlConfig fromConfig(Config mp) {
        return new SamlConfig(
                get(mp, "security.saml2.registrationId", "keycloak"),
                get(mp, "security.saml2.sp.entityId", null),
                get(mp, "security.saml2.sp.acs", null),
                get(mp, "security.saml2.idpSingleLoginUrl", null),
                get(mp, "security.saml2.idp.issuer", null),
                get(mp, "security.saml2.idp.cert", null),
                get(mp, "security.saml2.sp.cert", null),
                get(mp, "security.saml2.privateKey", null),
                mp.getOptionalValue("security.saml2.autoCreateUser", Boolean.class).orElse(false));
    }

    private static String get(Config mp, String key, String defaultValue) {
        return mp.getOptionalValue(key, String.class).orElse(defaultValue);
    }
}
