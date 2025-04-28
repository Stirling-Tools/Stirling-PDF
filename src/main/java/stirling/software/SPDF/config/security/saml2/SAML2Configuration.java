package stirling.software.SPDF.config.security.saml2;

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
import org.springframework.security.saml2.provider.service.authentication.AbstractSaml2AuthenticationRequest;
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.HttpSessionSaml2AuthenticationRequestRepository;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;

@Configuration
@Slf4j
@ConditionalOnProperty(value = "security.saml2.enabled", havingValue = "true")
@RequiredArgsConstructor
public class SAML2Configuration {

    private final ApplicationProperties applicationProperties;

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() throws Exception {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();
        X509Certificate idpCert = CertificateUtils.readCertificate(samlConf.getIdpCert());
        Saml2X509Credential verificationCredential = Saml2X509Credential.verification(idpCert);
        Resource privateKeyResource = samlConf.getPrivateKey();
        Resource certificateResource = samlConf.getSpCert();
        Saml2X509Credential signingCredential =
                new Saml2X509Credential(
                        CertificateUtils.readPrivateKey(privateKeyResource),
                        CertificateUtils.readCertificate(certificateResource),
                        Saml2X509CredentialType.SIGNING);
        RelyingPartyRegistration rp =
                RelyingPartyRegistration.withRegistrationId(samlConf.getRegistrationId())
                        .signingX509Credentials(c -> c.add(signingCredential))
                        .entityId(samlConf.getIdpIssuer())
                        .singleLogoutServiceBinding(Saml2MessageBinding.POST)
                        .singleLogoutServiceLocation(samlConf.getIdpSingleLogoutUrl())
                        .singleLogoutServiceResponseLocation("http://localhost:8080/login")
                        .assertionConsumerServiceBinding(Saml2MessageBinding.POST)
                        .assertionConsumerServiceLocation(
                                "{baseUrl}/login/saml2/sso/{registrationId}")
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
                                                .wantAuthnRequestsSigned(true))
                        .build();
        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    @ConditionalOnProperty(name = "security.saml2.enabled", havingValue = "true")
    public OpenSaml4AuthenticationRequestResolver authenticationRequestResolver(
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        OpenSaml4AuthenticationRequestResolver resolver =
                new OpenSaml4AuthenticationRequestResolver(relyingPartyRegistrationRepository);

        resolver.setAuthnRequestCustomizer(
                customizer -> {
                    HttpServletRequest request = customizer.getRequest();
                    AuthnRequest authnRequest = customizer.getAuthnRequest();
                    HttpSessionSaml2AuthenticationRequestRepository requestRepository =
                            new HttpSessionSaml2AuthenticationRequestRepository();
                    AbstractSaml2AuthenticationRequest saml2AuthenticationRequest =
                            requestRepository.loadAuthenticationRequest(request);

                    if (saml2AuthenticationRequest != null) {
                        String sessionId = request.getSession(false).getId();

                        log.debug(
                                "Retrieving SAML 2 authentication request ID from the current HTTP session {}",
                                sessionId);

                        String authenticationRequestId = saml2AuthenticationRequest.getId();

                        if (!authenticationRequestId.isBlank()) {
                            authnRequest.setID(authenticationRequestId);
                        } else {
                            log.warn(
                                    "No authentication request found for HTTP session {}. Generating new ID",
                                    sessionId);
                            authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));
                        }
                    } else {
                        log.debug("Generating new authentication request ID");
                        authnRequest.setID("ARQ" + UUID.randomUUID().toString().substring(1));
                    }

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
