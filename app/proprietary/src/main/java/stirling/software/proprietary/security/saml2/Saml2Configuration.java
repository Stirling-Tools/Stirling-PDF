package stirling.software.proprietary.security.saml2;

import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.UUID;

import org.opensaml.saml.saml2.core.AuthnRequest;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;
import stirling.software.common.model.io.Resource;

// TODO: Migration required - there is NO Quarkus SAML extension. The original class was a Spring
// @Configuration that exposed two @Bean factory methods producing Spring Security SAML2 types
// (org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository
// and ...web.authentication.OpenSaml5AuthenticationRequestResolver). Those builder/glue types have
// no Quarkus equivalent, so the Spring Security SAML2 imports and @Configuration/@Bean wiring have
// been removed. The SAML Service Provider must be rehosted on a Jakarta @WebServlet driving OpenSAML
// 5 directly (see the dnulnets/quarkus-saml pattern). The OpenSAML 5 logic and the credential /
// metadata-location preparation below are PRESERVED so the rehost can reuse them.
//
// TODO: Migration required - @ConditionalOnProperty(value = "security.saml2.enabled",
// havingValue = "true") gated this whole class on a runtime property. Quarkus has no runtime
// @ConditionalOnProperty for beans; enforce the security.saml2.enabled runtime toggle at the SAML SP
// entry point (e.g. a guard in the @WebServlet, or skip SP registration when disabled).
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class Saml2Configuration {

    private final ApplicationProperties applicationProperties;

    // TODO: Migration required - originally a @Bean returning Spring Security's
    // RelyingPartyRegistrationRepository built via RelyingPartyRegistration.withRegistrationId(...)
    // (InMemoryRelyingPartyRegistrationRepository, Saml2X509Credential, Saml2MessageBinding). Those
    // Spring Security SAML2 builder types are unavailable in Quarkus. The credential loading
    // (CertificateUtils via the common Resource shim) and the entityId / ACS / SLO location strings
    // are kept verbatim so the OpenSAML-5-based SP rehost can consume them; the actual
    // RelyingPartyRegistration assembly must be re-implemented against OpenSAML 5 metadata APIs.
    public void prepareRelyingPartyRegistration() throws Exception {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();

        log.info(
                "Initializing SAML2 configuration with registration ID: {}",
                samlConf.getRegistrationId());

        // Load IdP certificate
        X509Certificate idpCert;
        try {
            Resource idpCertResource = samlConf.getIdpCert();
            log.info("Loading IdP certificate from: {}", idpCertResource.getFilename());
            if (!idpCertResource.exists()) {
                log.error("SAML2 IdP certificate not found at: {}", idpCertResource.getFilename());
                throw new IllegalStateException(
                        "SAML2 IdP certificate file does not exist: "
                                + idpCertResource.getFilename());
            }
            idpCert = CertificateUtils.readCertificate(idpCertResource);
            log.info(
                    "Successfully loaded IdP certificate. Subject: {}",
                    idpCert.getSubjectX500Principal().getName());
        } catch (Exception e) {
            log.error("Failed to load SAML2 IdP certificate: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 IdP certificate", e);
        }

        // TODO: Migration required - was Saml2X509Credential.verification(idpCert). Re-create the
        // IdP verification credential from idpCert using OpenSAML 5 (BasicX509Credential).

        // Load SP private key and certificate
        Resource privateKeyResource = samlConf.getPrivateKey();
        Resource certificateResource = samlConf.getSpCert();

        log.info("Loading SP private key from: {}", privateKeyResource.getFilename());
        if (!privateKeyResource.exists()) {
            log.error("SAML2 SP private key not found at: {}", privateKeyResource.getFilename());
            throw new IllegalStateException(
                    "SAML2 SP private key file does not exist: " + privateKeyResource.getFilename());
        }

        log.info("Loading SP certificate from: {}", certificateResource.getFilename());
        if (!certificateResource.exists()) {
            log.error("SAML2 SP certificate not found at: {}", certificateResource.getFilename());
            throw new IllegalStateException(
                    "SAML2 SP certificate file does not exist: " + certificateResource.getFilename());
        }

        // TODO: Migration required - was new Saml2X509Credential(privateKey, cert,
        // Saml2X509CredentialType.SIGNING). Build the SP signing credential from the key/cert below
        // using OpenSAML 5 (BasicX509Credential) instead of Spring Security's Saml2X509Credential.
        try {
            CertificateUtils.readPrivateKey(privateKeyResource);
            CertificateUtils.readCertificate(certificateResource);
            log.info("Successfully loaded SP credentials");
        } catch (Exception e) {
            log.error("Failed to load SAML2 SP credentials: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 SP credentials", e);
        }

        // Get backend URL from configuration (for SAML endpoints)
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl == null || backendUrl.isBlank()) {
            backendUrl = "{baseUrl}"; // Fallback to auto-resolution at the SP entry point
            log.warn(
                    "system.backendUrl not configured - SAML metadata will use request-based URLs. Set system.backendUrl for production use.");
        } else {
            log.info("Using configured backend URL for SAML: {}", backendUrl);
        }

        String entityId =
                backendUrl + "/saml2/service-provider-metadata/" + samlConf.getRegistrationId();
        String acsLocation = backendUrl + "/login/saml2/sso/{registrationId}";
        String sloResponseLocation = backendUrl + "/login";

        // TODO: Migration required - the following Spring Security RelyingPartyRegistration was built
        // here and stored in an InMemoryRelyingPartyRegistrationRepository. Re-implement against the
        // OpenSAML-5-based SP using entityId / acsLocation / sloResponseLocation, the IdP issuer
        // (samlConf.getIdpIssuer()), SSO/SLO bindings (POST) and locations
        // (samlConf.getIdpSingleLoginUrl() / samlConf.getIdpSingleLogoutUrl()), authnRequestsSigned
        // and wantAuthnRequestsSigned both true, and the signing/verification credentials above.
        log.info(
                "SAML2 configuration prepared. Registration ID: {}, IdP: {}, entityId: {}, acs: {}, slo: {}",
                samlConf.getRegistrationId(),
                samlConf.getIdpIssuer(),
                entityId,
                acsLocation,
                sloResponseLocation);
    }

    // TODO: Migration required - originally a @Bean returning Spring Security's
    // OpenSaml5AuthenticationRequestResolver, configured with a RelayState resolver and an
    // AuthnRequest customizer. That resolver type is Spring-Security-specific and has no Quarkus
    // equivalent. The RelayState logic (Tauri detection -> TauriSamlUtils.buildRelayState(nonce))
    // and the AuthnRequest customization (unique ARQ id + logging) are PRESERVED below as helper
    // methods so the OpenSAML-5-based SP rehost can invoke them when building the AuthnRequest.

    /**
     * Resolves the SAML RelayState for a request, preserving the original Tauri-aware behavior:
     * returns null unless the {@code tauri} parameter equals "1", otherwise builds a relay state
     * from the {@code nonce} parameter.
     */
    static String resolveRelayState(HttpServletRequest request) {
        String tauriParam = request.getParameter("tauri");
        if (!"1".equals(tauriParam)) {
            return null;
        }
        String nonce = request.getParameter("nonce");
        return TauriSamlUtils.buildRelayState(nonce);
    }

    /**
     * Applies the original AuthnRequest customization: assigns a unique request ID and logs the
     * request/HTTP details. Invoke this from the OpenSAML-5-based SP after building the AuthnRequest.
     */
    static void customizeAuthnRequest(HttpServletRequest request, AuthnRequest authnRequest) {
        // Generate a unique AuthnRequest ID for each SAML request
        authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));

        logAuthnRequestDetails(authnRequest);
        logHttpRequestDetails(request);
    }

    private static void logAuthnRequestDetails(AuthnRequest authnRequest) {
        String message =
                """
                        AuthnRequest:

                        ID: {}
                        Issuer: {}
                        IssueInstant: {}
                        AssertionConsumerService (ACS) URL: {}
                        """;
        log.debug(
                message,
                authnRequest.getID(),
                authnRequest.getIssuer() != null ? authnRequest.getIssuer().getValue() : null,
                authnRequest.getIssueInstant(),
                authnRequest.getAssertionConsumerServiceURL());

        if (authnRequest.getNameIDPolicy() != null) {
            log.debug("NameIDPolicy Format: {}", authnRequest.getNameIDPolicy().getFormat());
        }
    }

    private static void logHttpRequestDetails(HttpServletRequest request) {
        log.debug("HTTP Headers: ");
        Collections.list(request.getHeaderNames())
                .forEach(
                        headerName ->
                                log.debug("{}: {}", headerName, request.getHeader(headerName)));
        String message =
                """
                        HTTP Request Method: {}
                        Session ID: {}
                        Request Path: {}
                        Query String: {}
                        Remote Address: {}

                        SAML Request Parameters:

                        SAMLRequest: {}
                        RelayState: {}
                        """;
        log.debug(
                message,
                request.getMethod(),
                request.getSession().getId(),
                request.getRequestURI(),
                request.getQueryString(),
                request.getRemoteAddr(),
                request.getParameter("SAMLRequest"),
                request.getParameter("RelayState"));
    }
}
