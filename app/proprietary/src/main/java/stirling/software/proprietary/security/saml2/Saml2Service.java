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

    @SuppressWarnings("unchecked")
    static <T> T build(QName qname) {
        XMLObjectBuilderFactory factory = XMLObjectProviderRegistrySupport.getBuilderFactory();
        return (T) factory.getBuilder(qname).buildObject(qname);
    }
}
