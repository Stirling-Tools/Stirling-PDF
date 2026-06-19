package stirling.software.proprietary.security.saml2;

import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;

import org.bouncycastle.asn1.pkcs.PrivateKeyInfo;
import org.bouncycastle.openssl.PEMKeyPair;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter;
import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemReader;

import stirling.software.common.model.io.Resource;

// TODO: Migration required - the original @ConditionalOnProperty(name =
// "security.saml2.enabled", havingValue = "true") gated this class on a runtime property. This is a
// utility holding only static methods (not a CDI bean), so the annotation was a no-op for
// instantiation and is dropped. Callers must enforce the security.saml2.enabled runtime toggle
// (e.g. via a runtime guard at the SAML SP entry point); see the SAML2 migration notes.
public class CertificateUtils {

    public static X509Certificate readCertificate(Resource certificateResource) throws Exception {
        try (PemReader pemReader =
                new PemReader(
                        new InputStreamReader(
                                certificateResource.getInputStream(), StandardCharsets.UTF_8))) {
            PemObject pemObject = pemReader.readPemObject();
            byte[] decodedCert = pemObject.getContent();
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            return (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(decodedCert));
        }
    }

    public static RSAPrivateKey readPrivateKey(Resource privateKeyResource) throws Exception {
        try (PEMParser pemParser =
                new PEMParser(
                        new InputStreamReader(
                                privateKeyResource.getInputStream(), StandardCharsets.UTF_8))) {

            Object object = pemParser.readObject();
            JcaPEMKeyConverter converter = new JcaPEMKeyConverter();

            if (object instanceof PEMKeyPair keypair) {
                // Handle traditional RSA private key format
                return (RSAPrivateKey) converter.getPrivateKey(keypair.getPrivateKeyInfo());
            } else if (object instanceof PrivateKeyInfo keyInfo) {
                // Handle PKCS#8 format
                return (RSAPrivateKey) converter.getPrivateKey(keyInfo);
            } else {
                throw new IllegalArgumentException(
                        "Unsupported key format: "
                                + (object != null ? object.getClass().getName() : "null"));
            }
        }
    }
}
