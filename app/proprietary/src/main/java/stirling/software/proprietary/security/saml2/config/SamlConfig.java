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
        String registrationId = get(mp, "security.saml2.registrationId", "keycloak");
        String backendUrl = get(mp, "system.backendUrl", "http://localhost:8080");
        // The SP entityId MUST match the registrationId Keycloak's SAML client is keyed on, which
        // is
        // the SP metadata URL (this is what Spring Security's Saml2 default used). The compose's
        // SECURITY_SAML2_SP_ENTITYID is the bare host and does not match, so derive it here.
        String spEntityId =
                backendUrl.replaceAll("/+$", "")
                        + "/saml2/service-provider-metadata/"
                        + registrationId;
        String acsUrl =
                get(
                        mp,
                        "security.saml2.sp.acs",
                        backendUrl.replaceAll("/+$", "") + "/login/saml2/sso/" + registrationId);
        return new SamlConfig(
                registrationId,
                spEntityId,
                acsUrl,
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
