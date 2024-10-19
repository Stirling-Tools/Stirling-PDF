package stirling.software.SPDF.config.security.saml2;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;

import org.springframework.core.io.Resource;
import org.springframework.util.FileCopyUtils;

public class CertificateUtils {

    public static X509Certificate readCertificate(Resource certificateResource) throws Exception {
        String certificateString =
                new String(
                        FileCopyUtils.copyToByteArray(certificateResource.getInputStream()),
                        StandardCharsets.UTF_8);
        String certContent =
                certificateString
                        .replace("-----BEGIN CERTIFICATE-----", "")
                        .replace("-----END CERTIFICATE-----", "")
                        .replaceAll("\\R", "")
                        .replaceAll("\\s+", "");
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        byte[] decodedCert = Base64.getDecoder().decode(certContent);
        return (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(decodedCert));
    }

    public static RSAPrivateKey readPrivateKey(Resource privateKeyResource) throws Exception {
        String privateKeyString =
                new String(
                        FileCopyUtils.copyToByteArray(privateKeyResource.getInputStream()),
                        StandardCharsets.UTF_8);
        String privateKeyContent =
                privateKeyString
                        .replace("-----BEGIN PRIVATE KEY-----", "")
                        .replace("-----END PRIVATE KEY-----", "")
                        .replaceAll("\\R", "")
                        .replaceAll("\\s+", "");
        KeyFactory kf = KeyFactory.getInstance("RSA");
        byte[] decodedKey = Base64.getDecoder().decode(privateKeyContent);
        return (RSAPrivateKey) kf.generatePrivate(new PKCS8EncodedKeySpec(decodedKey));
    }
}
