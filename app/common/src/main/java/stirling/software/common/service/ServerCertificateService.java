package stirling.software.common.service;

import java.io.InputStream;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.Date;

public interface ServerCertificateService {

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

    class ServerCertificateInfo {
        private final boolean exists;
        private final String subject;
        private final String issuer;
        private final Date validFrom;
        private final Date validTo;

        public ServerCertificateInfo(
                boolean exists, String subject, String issuer, Date validFrom, Date validTo) {
            this.exists = exists;
            this.subject = subject;
            this.issuer = issuer;
            this.validFrom = validFrom;
            this.validTo = validTo;
        }

        public boolean isExists() {
            return exists;
        }

        public String getSubject() {
            return subject;
        }

        public String getIssuer() {
            return issuer;
        }

        public Date getValidFrom() {
            return validFrom;
        }

        public Date getValidTo() {
            return validTo;
        }
    }
}