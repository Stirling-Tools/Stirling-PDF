package stirling.software.SPDF.service.macos;

import java.io.ByteArrayOutputStream;
import java.security.InvalidKeyException;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SignatureException;
import java.security.SignatureSpi;

/**
 * Signature engine that hands the whole message to {@code SecKeyCreateSignature}. RSA output is
 * PKCS#1 v1.5 and EC output is DER-encoded X9.62, the encodings JCA's SHAxwithRSA/ECDSA produce, so
 * CMS consumers see no difference from a software key.
 */
public abstract class MacKeychainSignature extends SignatureSpi {

    private final String keyAlgorithm;
    private final String secAlgorithm;
    private final ByteArrayOutputStream message = new ByteArrayOutputStream();
    private MacKeychainPrivateKey key;

    MacKeychainSignature(String keyAlgorithm, String secAlgorithm) {
        this.keyAlgorithm = keyAlgorithm;
        this.secAlgorithm = secAlgorithm;
    }

    @Override
    protected void engineInitSign(PrivateKey privateKey) throws InvalidKeyException {
        if (!(privateKey instanceof MacKeychainPrivateKey keychainKey)) {
            throw new InvalidKeyException("Not a macOS keychain key");
        }
        if (!keyAlgorithm.equalsIgnoreCase(keychainKey.getAlgorithm())) {
            throw new InvalidKeyException(
                    "Key is " + keychainKey.getAlgorithm() + ", expected " + keyAlgorithm);
        }
        key = keychainKey;
        message.reset();
    }

    @Override
    protected void engineInitVerify(PublicKey publicKey) throws InvalidKeyException {
        throw new InvalidKeyException("Verification is done with the certificate's public key");
    }

    @Override
    protected void engineUpdate(byte b) {
        message.write(b);
    }

    @Override
    protected void engineUpdate(byte[] b, int off, int len) {
        message.write(b, off, len);
    }

    @Override
    protected byte[] engineSign() throws SignatureException {
        if (key == null) {
            throw new SignatureException("Not initialised for signing");
        }
        MacSecurity security = MacSecurity.get();
        if (security == null) {
            throw new SignatureException("The macOS keychain is not available");
        }
        try {
            return security.sign(key.identity(), secAlgorithm, message.toByteArray());
        } finally {
            message.reset();
        }
    }

    @Override
    protected boolean engineVerify(byte[] sigBytes) throws SignatureException {
        throw new SignatureException("Verification is done with the certificate's public key");
    }

    @Override
    @Deprecated
    protected void engineSetParameter(String param, Object value) {
        throw new UnsupportedOperationException();
    }

    @Override
    @Deprecated
    protected Object engineGetParameter(String param) {
        throw new UnsupportedOperationException();
    }

    public static final class Sha256WithRsa extends MacKeychainSignature {
        public Sha256WithRsa() {
            super("RSA", "kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA256");
        }
    }

    public static final class Sha384WithRsa extends MacKeychainSignature {
        public Sha384WithRsa() {
            super("RSA", "kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA384");
        }
    }

    public static final class Sha512WithRsa extends MacKeychainSignature {
        public Sha512WithRsa() {
            super("RSA", "kSecKeyAlgorithmRSASignatureMessagePKCS1v15SHA512");
        }
    }

    public static final class Sha256WithEcdsa extends MacKeychainSignature {
        public Sha256WithEcdsa() {
            super("EC", "kSecKeyAlgorithmECDSASignatureMessageX962SHA256");
        }
    }

    public static final class Sha384WithEcdsa extends MacKeychainSignature {
        public Sha384WithEcdsa() {
            super("EC", "kSecKeyAlgorithmECDSASignatureMessageX962SHA384");
        }
    }

    public static final class Sha512WithEcdsa extends MacKeychainSignature {
        public Sha512WithEcdsa() {
            super("EC", "kSecKeyAlgorithmECDSASignatureMessageX962SHA512");
        }
    }
}
