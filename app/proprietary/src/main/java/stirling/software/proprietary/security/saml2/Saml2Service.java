package stirling.software.proprietary.security.saml2;

import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Base64;

import javax.xml.namespace.QName;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;
import org.opensaml.core.config.InitializationService;
import org.opensaml.core.xml.XMLObjectBuilderFactory;
import org.opensaml.core.xml.config.XMLObjectProviderRegistrySupport;
import org.opensaml.core.xml.io.MarshallingException;
import org.opensaml.core.xml.util.XMLObjectSupport;
import org.opensaml.saml.common.xml.SAMLConstants;
import org.opensaml.saml.saml2.metadata.AssertionConsumerService;
import org.opensaml.saml.saml2.metadata.EntityDescriptor;
import org.opensaml.saml.saml2.metadata.KeyDescriptor;
import org.opensaml.saml.saml2.metadata.SPSSODescriptor;
import org.opensaml.security.credential.UsageType;
import org.opensaml.xmlsec.signature.KeyInfo;
import org.opensaml.xmlsec.signature.X509Data;

import net.shibboleth.shared.xml.SerializeSupport;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.io.FileSystemResource;
import stirling.software.proprietary.security.saml2.config.SamlConfig;

/**
 * SAML2 Service Provider built directly on OpenSAML 5 (there is no Quarkus SAML extension). Holds
 * the initialized OpenSAML environment, the SP signing key/cert and the IdP verification cert, and
 * produces the SP metadata document. The {@link SamlSpServlet} drives the AuthnRequest/ACS flow.
 *
 * <p>Config is read straight from MicroProfile config (the {@code SECURITY_SAML2_*} env the compose
 * sets) because the {@code ApplicationProperties} SAML2 block uses {@code Resource}-typed cert
 * fields that the partial config overlay does not bind.
 */
@Slf4j
@ApplicationScoped
public class Saml2Service {

    @Getter private volatile SamlConfig config;
    @Getter private volatile X509Certificate spCertificate;
    @Getter private volatile PrivateKey spPrivateKey;
    @Getter private volatile X509Certificate idpCertificate;
    @Getter private volatile boolean ready;

    void onStart(@Observes StartupEvent event) {
        Config mp = ConfigProvider.getConfig();
        if (!mp.getOptionalValue("security.saml2.enabled", Boolean.class).orElse(false)) {
            log.debug("SAML2 disabled; SP not initialised");
            return;
        }
        try {
            InitializationService.initialize();
            this.config = SamlConfig.fromConfig(mp);
            this.spCertificate =
                    stirling.software.proprietary.security.saml2.CertificateUtils.readCertificate(
                            new FileSystemResource(config.spCertPath()));
            this.spPrivateKey =
                    stirling.software.proprietary.security.saml2.CertificateUtils.readPrivateKey(
                            new FileSystemResource(config.privateKeyPath()));
            this.idpCertificate =
                    stirling.software.proprietary.security.saml2.CertificateUtils.readCertificate(
                            new FileSystemResource(config.idpCertPath()));
            this.ready = true;
            log.info(
                    "SAML2 SP initialised (registrationId={}, entityId={}, acs={})",
                    config.registrationId(),
                    config.spEntityId(),
                    config.acsUrl());
        } catch (Exception e) {
            log.error("Failed to initialise SAML2 SP", e);
        }
    }

    /** Build the SP SAML metadata XML (EntityDescriptor with ACS + signing cert). */
    public String buildMetadata()
            throws MarshallingException, java.security.cert.CertificateEncodingException {
        EntityDescriptor entityDescriptor = build(EntityDescriptor.DEFAULT_ELEMENT_NAME);
        entityDescriptor.setEntityID(config.spEntityId());

        SPSSODescriptor spsso = build(SPSSODescriptor.DEFAULT_ELEMENT_NAME);
        spsso.setAuthnRequestsSigned(true);
        spsso.setWantAssertionsSigned(true);
        spsso.addSupportedProtocol(SAMLConstants.SAML20P_NS);

        KeyDescriptor keyDescriptor = build(KeyDescriptor.DEFAULT_ELEMENT_NAME);
        keyDescriptor.setUse(UsageType.SIGNING);
        keyDescriptor.setKeyInfo(buildKeyInfo(spCertificate));
        spsso.getKeyDescriptors().add(keyDescriptor);

        AssertionConsumerService acs = build(AssertionConsumerService.DEFAULT_ELEMENT_NAME);
        acs.setBinding(SAMLConstants.SAML2_POST_BINDING_URI);
        acs.setLocation(config.acsUrl());
        acs.setIndex(0);
        acs.setIsDefault(true);
        spsso.getAssertionConsumerServices().add(acs);

        entityDescriptor.getRoleDescriptors().add(spsso);

        return SerializeSupport.nodeToString(XMLObjectSupport.marshall(entityDescriptor));
    }

    private KeyInfo buildKeyInfo(X509Certificate cert)
            throws java.security.cert.CertificateEncodingException {
        KeyInfo keyInfo = build(KeyInfo.DEFAULT_ELEMENT_NAME);
        X509Data x509Data = build(X509Data.DEFAULT_ELEMENT_NAME);
        org.opensaml.xmlsec.signature.X509Certificate xmlCert =
                build(org.opensaml.xmlsec.signature.X509Certificate.DEFAULT_ELEMENT_NAME);
        xmlCert.setValue(Base64.getEncoder().encodeToString(cert.getEncoded()));
        x509Data.getX509Certificates().add(xmlCert);
        keyInfo.getX509Datas().add(x509Data);
        return keyInfo;
    }

    /**
     * Build a signed AuthnRequest and return the IdP SSO URL with the HTTP-Redirect binding query
     * (SAMLRequest deflated+base64, plus SigAlg/Signature signed with the SP private key).
     */
    public String buildAuthnRequestRedirectUrl(String relayState) throws Exception {
        org.opensaml.saml.saml2.core.AuthnRequest authnRequest =
                build(org.opensaml.saml.saml2.core.AuthnRequest.DEFAULT_ELEMENT_NAME);
        authnRequest.setID("ARQ" + java.util.UUID.randomUUID());
        authnRequest.setIssueInstant(java.time.Instant.now());
        authnRequest.setDestination(config.idpSingleLoginUrl());
        authnRequest.setProtocolBinding(SAMLConstants.SAML2_POST_BINDING_URI);
        authnRequest.setAssertionConsumerServiceURL(config.acsUrl());

        org.opensaml.saml.saml2.core.Issuer issuer =
                build(org.opensaml.saml.saml2.core.Issuer.DEFAULT_ELEMENT_NAME);
        issuer.setValue(config.spEntityId());
        authnRequest.setIssuer(issuer);

        org.opensaml.saml.saml2.core.NameIDPolicy nameIdPolicy =
                build(org.opensaml.saml.saml2.core.NameIDPolicy.DEFAULT_ELEMENT_NAME);
        nameIdPolicy.setFormat("urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
        nameIdPolicy.setAllowCreate(true);
        authnRequest.setNameIDPolicy(nameIdPolicy);

        String xml = SerializeSupport.nodeToString(XMLObjectSupport.marshall(authnRequest));

        // HTTP-Redirect binding: DEFLATE (raw) + base64.
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.util.zip.DeflaterOutputStream deflater =
                new java.util.zip.DeflaterOutputStream(
                        baos, new java.util.zip.Deflater(java.util.zip.Deflater.DEFLATED, true))) {
            deflater.write(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        String samlRequest = Base64.getEncoder().encodeToString(baos.toByteArray());

        String sigAlg = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
        StringBuilder query = new StringBuilder();
        query.append("SAMLRequest=").append(urlEncode(samlRequest));
        if (relayState != null && !relayState.isBlank()) {
            query.append("&RelayState=").append(urlEncode(relayState));
        }
        query.append("&SigAlg=").append(urlEncode(sigAlg));

        java.security.Signature signer = java.security.Signature.getInstance("SHA256withRSA");
        signer.initSign(spPrivateKey);
        signer.update(query.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String signature = Base64.getEncoder().encodeToString(signer.sign());
        query.append("&Signature=").append(urlEncode(signature));

        return config.idpSingleLoginUrl() + "?" + query;
    }

    /**
     * Validate a base64 SAMLResponse against the IdP signing cert and return the authenticated
     * subject's NameID (used as the username).
     */
    public String validateResponseAndGetUsername(String samlResponseB64) throws Exception {
        byte[] decoded = Base64.getDecoder().decode(samlResponseB64);
        org.opensaml.saml.saml2.core.Response response =
                (org.opensaml.saml.saml2.core.Response)
                        XMLObjectSupport.unmarshallFromInputStream(
                                XMLObjectProviderRegistrySupport.getParserPool(),
                                new java.io.ByteArrayInputStream(decoded));

        org.opensaml.security.x509.BasicX509Credential idpCredential =
                new org.opensaml.security.x509.BasicX509Credential(idpCertificate);

        boolean responseSigned = response.isSigned();
        if (responseSigned) {
            validateSignature(response.getSignature(), idpCredential);
        }
        if (response.getAssertions().isEmpty()) {
            throw new IllegalStateException("SAML response contained no assertions");
        }
        org.opensaml.saml.saml2.core.Assertion assertion = response.getAssertions().get(0);
        if (assertion.isSigned()) {
            validateSignature(assertion.getSignature(), idpCredential);
        } else if (!responseSigned) {
            throw new IllegalStateException("Neither SAML response nor assertion was signed");
        }
        if (assertion.getSubject() == null || assertion.getSubject().getNameID() == null) {
            throw new IllegalStateException("SAML assertion has no subject NameID");
        }
        return assertion.getSubject().getNameID().getValue();
    }

    private void validateSignature(
            org.opensaml.xmlsec.signature.Signature signature,
            org.opensaml.security.x509.BasicX509Credential credential)
            throws Exception {
        new org.opensaml.saml.security.impl.SAMLSignatureProfileValidator().validate(signature);
        org.opensaml.xmlsec.signature.support.SignatureValidator.validate(signature, credential);
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    static <T> T build(QName qname) {
        XMLObjectBuilderFactory factory = XMLObjectProviderRegistrySupport.getBuilderFactory();
        return (T) factory.getBuilder(qname).buildObject(qname);
    }
}
