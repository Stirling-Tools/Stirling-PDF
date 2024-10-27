package stirling.software.SPDF.config.security.saml2;

import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;

import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemReader;
import org.springframework.core.io.Resource;

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
        try (PemReader pemReader =
                new PemReader(
                        new InputStreamReader(
                                privateKeyResource.getInputStream(), StandardCharsets.UTF_8))) {
            PemObject pemObject = pemReader.readPemObject();
            byte[] decodedKey = pemObject.getContent();
            return (RSAPrivateKey)
                    KeyFactory.getInstance("RSA")
                            .generatePrivate(new PKCS8EncodedKeySpec(decodedKey));
        }
    }
}
