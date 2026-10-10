package stirling.software.SPDF.service.keychain;

import java.io.ByteArrayOutputStream;
import java.security.InvalidKeyException;
import java.security.PrivateKey;
import java.security.SignatureException;
import java.security.SignatureSpi;

public final class MacKeychainSignatureSpi extends SignatureSpi {

    private MacKeychainPrivateKey privateKey;
    private String algorithm;
    private final ByteArrayOutputStream message = new ByteArrayOutputStream();

    @Override
    protected void engineInitVerify(java.security.PublicKey publicKey) throws InvalidKeyException {
        throw new InvalidKeyException("Verification is not supported for macOS Keychain keys");
    }

    @Override
    protected void engineInitSign(PrivateKey key) throws InvalidKeyException {
        if (!(key instanceof MacKeychainPrivateKey macKey)) {
            throw new InvalidKeyException("Expected MacKeychainPrivateKey");
        }
        privateKey = macKey;
        algorithm = resolveAlgorithm(macKey.getAlgorithm());
        message.reset();
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
        try {
            return MacKeychainHelper.sign(
                    privateKey.identityHash(), algorithm, message.toByteArray());
        } catch (Exception e) {
            throw new SignatureException(e.getMessage(), e);
        }
    }

    @Override
    protected boolean engineVerify(byte[] sigBytes) {
        throw new UnsupportedOperationException("Verification is not supported");
    }

    @Override
    protected void engineSetParameter(String param, Object value) {
        // No parameters.
    }

    @Override
    protected Object engineGetParameter(String param) {
        return null;
    }

    private static String resolveAlgorithm(String keyAlgorithm) {
        String alg = keyAlgorithm == null ? "RSA" : keyAlgorithm.toUpperCase(java.util.Locale.ROOT);
        if (alg.contains("EC")) {
            return "SHA256withECDSA";
        }
        return "SHA256withRSA";
    }
}
