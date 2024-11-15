package stirling.software.SPDF.config.security.saml2;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Scanner;

import org.bouncycastle.util.io.pem.PemObject;
import org.bouncycastle.util.io.pem.PemReader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;

import lombok.extern.slf4j.Slf4j;

@Slf4j
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
    
    
    public static X509Certificate getIdPCertificate(Resource certificateResource) throws Exception {
 
        if (certificateResource instanceof UrlResource) {
            return extractCertificateFromMetadata(certificateResource);
        } else {
            // Treat as file resource
            return readCertificate(certificateResource);
        }
    }

    private static X509Certificate extractCertificateFromMetadata(Resource metadataResource) throws Exception {
        log.info("Attempting to extract certificate from metadata resource: {}", metadataResource.getDescription());
        
        try (InputStream is = metadataResource.getInputStream()) {
            String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            log.info("Retrieved metadata content, length: {}", content.length());
            
            // Find the certificate data
            int startIndex = content.indexOf("<ds:X509Certificate>");
            int endIndex = content.indexOf("</ds:X509Certificate>");
            
            if (startIndex == -1 || endIndex == -1) {
                log.error("Certificate tags not found in metadata");
                throw new Exception("Certificate tags not found in metadata");
            }
            
            // Extract certificate data
            String certData = content.substring(
                startIndex + "<ds:X509Certificate>".length(),
                endIndex
            ).trim();
            
            log.info("Found certificate data, length: {}", certData.length());
            
            // Remove any whitespace and newlines from cert data
            certData = certData.replaceAll("\\s+", "");
            
            // Reconstruct PEM format with proper line breaks
            StringBuilder pemBuilder = new StringBuilder();
            pemBuilder.append("-----BEGIN CERTIFICATE-----\n");
            
            // Insert line breaks every 64 characters
            int lineLength = 64;
            for (int i = 0; i < certData.length(); i += lineLength) {
                int end = Math.min(i + lineLength, certData.length());
                pemBuilder.append(certData, i, end).append('\n');
            }
            
            pemBuilder.append("-----END CERTIFICATE-----");
            String pemCert = pemBuilder.toString();
            
            log.debug("Reconstructed PEM certificate:\n{}", pemCert);
            
            try {
                ByteArrayInputStream pemStream = new ByteArrayInputStream(pemCert.getBytes(StandardCharsets.UTF_8));
                
                CertificateFactory cf = CertificateFactory.getInstance("X.509");
                X509Certificate cert = (X509Certificate) cf.generateCertificate(pemStream);
                
                log.info("Successfully parsed certificate. Subject: {}", cert.getSubjectX500Principal());
                
                // Optional: check validity dates
                cert.checkValidity(); // Throws CertificateExpiredException if expired
                log.info("Certificate is valid (not expired)");
                
                return cert;
                
            } catch (Exception e) {
                log.error("Failed to parse certificate", e);
                throw new Exception("Failed to parse X509 certificate from metadata", e);
            }
        } catch (Exception e) {
            log.error("Error processing metadata resource", e);
            throw e;
        }
    }

    
}
