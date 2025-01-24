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
import org.springframework.security.saml2.provider.service.registration.InMemoryRelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistration;
import org.springframework.security.saml2.provider.service.registration.RelyingPartyRegistrationRepository;
import org.springframework.security.saml2.provider.service.registration.Saml2MessageBinding;
import org.springframework.security.saml2.provider.service.web.authentication.OpenSaml4AuthenticationRequestResolver;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.SAML2;

@Configuration
@Slf4j
@ConditionalOnProperty(
        value = "security.saml2.enabled",
        havingValue = "true",
        matchIfMissing = false)
public class SAML2Configuration {

    private final ApplicationProperties applicationProperties;

    public SAML2Configuration(ApplicationProperties applicationProperties) {

        this.applicationProperties = applicationProperties;
    }

    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public RelyingPartyRegistrationRepository relyingPartyRegistrations() throws Exception {
        SAML2 samlConf = applicationProperties.getSecurity().getSaml2();
        X509Certificate idpCert = CertificateUtils.readCertificate(samlConf.getidpCert());
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
                        .assertingPartyMetadata(
                                metadata ->
                                        metadata.entityId(samlConf.getIdpIssuer())
                                                .singleSignOnServiceLocation(
                                                        samlConf.getIdpSingleLoginUrl())
                                                .verificationX509Credentials(
                                                        c -> c.add(verificationCredential))
                                                .singleSignOnServiceBinding(
                                                        Saml2MessageBinding.POST)
                                                .wantAuthnRequestsSigned(true))
                        .build();
        return new InMemoryRelyingPartyRegistrationRepository(rp);
    }

    @Bean
    @ConditionalOnProperty(
            name = "security.saml2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public OpenSaml4AuthenticationRequestResolver authenticationRequestResolver(
            RelyingPartyRegistrationRepository relyingPartyRegistrationRepository) {
        OpenSaml4AuthenticationRequestResolver resolver =
                new OpenSaml4AuthenticationRequestResolver(relyingPartyRegistrationRepository);
        resolver.setAuthnRequestCustomizer(
                customizer -> {
                    log.debug("Customizing SAML Authentication request");
                    AuthnRequest authnRequest = customizer.getAuthnRequest();
                    log.debug("AuthnRequest ID: {}", authnRequest.getID());
                    if (authnRequest.getID() == null) {
                        authnRequest.setID("ARQ" + UUID.randomUUID().toString());
                    }
                    log.debug("AuthnRequest new ID after set: {}", authnRequest.getID());
                    log.debug("AuthnRequest IssueInstant: {}", authnRequest.getIssueInstant());
                    log.debug(
                            "AuthnRequest Issuer: {}",
                            authnRequest.getIssuer() != null
                                    ? authnRequest.getIssuer().getValue()
                                    : "null");
                    HttpServletRequest request = customizer.getRequest();
                    // Log HTTP request details
                    log.debug("HTTP Request Method: {}", request.getMethod());
                    log.debug("Request URI: {}", request.getRequestURI());
                    log.debug("Request URL: {}", request.getRequestURL().toString());
                    log.debug("Query String: {}", request.getQueryString());
                    log.debug("Remote Address: {}", request.getRemoteAddr());
                    // Log headers
                    Collections.list(request.getHeaderNames())
                            .forEach(
                                    headerName -> {
                                        log.debug(
                                                "Header - {}: {}",
                                                headerName,
                                                request.getHeader(headerName));
                                    });
                    // Log SAML specific parameters
                    log.debug("SAML Request Parameters:");
                    log.debug("SAMLRequest: {}", request.getParameter("SAMLRequest"));
                    log.debug("RelayState: {}", request.getParameter("RelayState"));
                    // Log session debugrmation if exists
                    if (request.getSession(false) != null) {
                        log.debug("Session ID: {}", request.getSession().getId());
                    }
                    // Log any assertions consumer service details if present
                    if (authnRequest.getAssertionConsumerServiceURL() != null) {
                        log.debug(
                                "AssertionConsumerServiceURL: {}",
                                authnRequest.getAssertionConsumerServiceURL());
                    }
                    // Log NameID policy if present
                    if (authnRequest.getNameIDPolicy() != null) {
                        log.debug(
                                "NameIDPolicy Format: {}",
                                authnRequest.getNameIDPolicy().getFormat());
                    }
                });
        return resolver;
    }
}
