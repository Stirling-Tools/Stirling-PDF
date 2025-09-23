package stirling.software.common.service;

import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.Date;

import lombok.AllArgsConstructor;
import lombok.Getter;

public interface ServerCertificateServiceInterface {

    boolean isEnabled();

    boolean hasServerCertificate();

    void initializeServerCertificate();

    KeyStore getServerKeyStore() throws Exception;

    String getServerCertificatePassword();

    X509Certificate getServerCertificate() throws Exception;

    byte[] getServerCertificatePublicKey() throws Exception;

    void uploadServerCertificate(InputStream p12Stream, String password) throws Exception;

    void deleteServerCertificate() throws Exception;

    ServerCertificateInfo getServerCertificateInfo() throws Exception;

    @Getter
    @AllArgsConstructor
    class ServerCertificateInfo {
        private final boolean exists;
        private final String subject;
        private final String issuer;
        private final Date validFrom;
        private final Date validTo;
    }
}
