package stirling.software.proprietary.security.saml2;

import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.UUID;

import org.opensaml.saml.saml2.core.AuthnRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.security.saml2.core.Saml2X509Credential;
import org.springframework.security.saml2.core.Saml2X509Credential.Saml2X509CredentialType;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml5AuthenticationRequestResolver;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.SAML2;

@Configuration
@Slf4j
@ConditionalOnProperty(value = "security.saml2.enabled", havingValue = "true")
@RequiredArgsConstructor
public class Saml2Configuration {

    private final ApplicationProperties applicationProperties;

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() throws Exception {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();

        log.info(
                "Initializing SAML2 configuration with registration ID: {}",
                samlConf.getRegistrationId());

        // Load IdP certificate
        X509Certificate idpCert;
        try {
            Resource idpCertResource = samlConf.getIdpCert();
            log.info("Loading IdP certificate from: {}", idpCertResource.getDescription());
            if (!idpCertResource.exists()) {
                log.error(
                        "SAML2 IdP certificate not found at: {}", idpCertResource.getDescription());
                throw new IllegalStateException(
                        "SAML2 IdP certificate file does not exist: "
                                + idpCertResource.getDescription());
            }
            idpCert = CertificateUtils.readCertificate(idpCertResource);
            log.info(
                    "Successfully loaded IdP certificate. Subject: {}",
                    idpCert.getSubjectX500Principal().getName());
        } catch (Exception e) {
            log.error("Failed to load SAML2 IdP certificate: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 IdP certificate", e);
        }

        Saml2X509Credential verificationCredential = Saml2X509Credential.verification(idpCert);

        // Load SP private key and certificate
        Resource privateKeyResource = samlConf.getPrivateKey();
        Resource certificateResource = samlConf.getSpCert();

        log.info("Loading SP private key from: {}", privateKeyResource.getDescription());
        if (!privateKeyResource.exists()) {
            log.error("SAML2 SP private key not found at: {}", privateKeyResource.getDescription());
            throw new IllegalStateException(
                    "SAML2 SP private key file does not exist: "
                            + privateKeyResource.getDescription());
        }

        log.info("Loading SP certificate from: {}", certificateResource.getDescription());
        if (!certificateResource.exists()) {
            log.error(
                    "SAML2 SP certificate not found at: {}", certificateResource.getDescription());
            throw new IllegalStateException(
                    "SAML2 SP certificate file does not exist: "
                            + certificateResource.getDescription());
        }

        Saml2X509Credential signingCredential;
        try {
            signingCredential =
                    new Saml2X509Credential(
                            CertificateUtils.readPrivateKey(privateKeyResource),
                            CertificateUtils.readCertificate(certificateResource),
                            Saml2X509CredentialType.SIGNING);
            log.info("Successfully loaded SP credentials");
        } catch (Exception e) {
            log.error("Failed to load SAML2 SP credentials: {}", e.getMessage(), e);
            throw new IllegalStateException("Failed to load SAML2 SP credentials", e);
        }

        // Get backend URL from configuration (for SAML endpoints)
        String backendUrl = applicationProperties.getSystem().getBackendUrl();
        if (backendUrl == null || backendUrl.isBlank()) {
            backendUrl = "{baseUrl}"; // Fallback to Spring's auto-resolution
            log.warn(
                    "system.backendUrl not configured - SAML metadata will use request-based URLs. Set system.backendUrl for production use.");
        } else {
            log.info("Using configured backend URL for SAML: {}", backendUrl);
        }

        String entityId =
                backendUrl + "/saml2/service-provider-metadata/" + samlConf.getRegistrationId();
        String acsLocation = backendUrl + "/login/saml2/sso/{registrationId}";
        String sloResponseLocation = backendUrl + "/login";

        RelyingPartyRegistration rp =
                RelyingPartyRegistration.withRegistrationId(samlConf.getRegistrationId())
                        .signingX509Credentials(c -> c.add(signingCredential))
                        .entityId(entityId)
                        .singleLogoutServiceBinding(Saml2MessageBinding.POST)
                        .singleLogoutServiceLocation(samlConf.getIdpSingleLogoutUrl())
                        .singleLogoutServiceResponseLocation(sloResponseLocation)
                        .assertionConsumerServiceBinding(Saml2MessageBinding.POST)
                        .assertionConsumerServiceLocation(acsLocation)
                        .authnRequestsSigned(true)
                        .assertingPartyMetadata(
                                metadata ->
                                        metadata.entityId(samlConf.getIdpIssuer())
                                                .verificationX509Credentials(
                                                        c -> c.add(verificationCredential))
                                                .singleSignOnServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .singleSignOnServiceLocation(
                                                        samlConf.getIdpSingleLoginUrl())
                                                .singleLogoutServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .singleLogoutServiceLocation(
                                                        samlConf.getIdpSingleLogoutUrl())
                                                .singleLogoutServiceResponseLocation(
                                                        sloResponseLocation)
                                                .wantAuthnRequestsSigned(true))
                        .build();

        log.info(
                "SAML2 configuration initialized successfully. Registration ID: {}, IdP: {}",
                samlConf.getRegistrationId(),
                samlConf.getIdpIssuer());
        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public OpenSaml5AuthenticationRequestResolver authenticationRequestResolver(
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        OpenSaml5AuthenticationRequestResolver resolver =
                new OpenSaml5AuthenticationRequestResolver(relyingPartyRegistrationRepository);

        resolver.setAuthnRequestCustomizer(
                customizer -> {
                    HttpServletRequest request = customizer.getRequest();
                    AuthnRequest authnRequest = customizer.getAuthnRequest();

                    // Generate a unique AuthnRequest ID for each SAML request
                    authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));

                    logAuthnRequestDetails(authnRequest);
                    logHttpRequestDetails(request);
                });
        return resolver;
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
