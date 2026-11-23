package stirling.software.SPDF.service.macos;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.Key;
import java.security.KeyStoreException;
import java.security.KeyStoreSpi;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.Enumeration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only view of the identities in the user's keychains and on inserted tokens. Aliases are the
 * certificate's SHA-1 fingerprint, which is stable across reloads and unique per identity.
 */
public final class MacKeychainKeyStore extends KeyStoreSpi {

    private record Entry(X509Certificate certificate, MacKeychainPrivateKey key) {}

    private final Map<String, Entry> entries = new LinkedHashMap<>();

    @Override
    public void engineLoad(InputStream stream, char[] password) {
        MacSecurity security = MacSecurity.get();
        if (security == null) {
            throw new IllegalStateException(
                    "The macOS keychain is not available", MacSecurity.loadFailure());
        }
        entries.clear();
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            for (MacSecurity.Identity identity : security.listIdentities()) {
                X509Certificate cert =
                        (X509Certificate)
                                factory.generateCertificate(
                                        new ByteArrayInputStream(identity.certificateDer()));
                String alias =
                        HexFormat.of()
                                .formatHex(
                                        MessageDigest.getInstance("SHA-1")
                                                .digest(identity.certificateDer()));
                entries.put(
                        alias,
                        new Entry(
                                cert,
                                new MacKeychainPrivateKey(
                                        cert.getPublicKey().getAlgorithm(),
                                        identity.ref(),
                                        identity.onToken())));
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Could not read the macOS keychain: " + e.getMessage(), e);
        }
    }

    @Override
    public Key engineGetKey(String alias, char[] password) {
        Entry entry = entries.get(alias);
        return entry == null ? null : entry.key();
    }

    /**
     * Leaf first, then whatever intermediates macOS can find, so a signature issued under an
     * intermediate CA validates for a recipient who holds only the root. Built per call because it
     * may fetch an issuer over the network.
     */
    @Override
    public Certificate[] engineGetCertificateChain(String alias) {
        Entry entry = entries.get(alias);
        if (entry == null) {
            return null;
        }
        MacSecurity security = MacSecurity.get();
        List<byte[]> ders =
                security == null ? List.of() : security.certificateChain(entry.key().identity());
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            List<Certificate> chain = new ArrayList<>();
            for (byte[] der : ders) {
                chain.add(factory.generateCertificate(new ByteArrayInputStream(der)));
            }
            if (!chain.isEmpty() && chain.get(0).equals(entry.certificate())) {
                return chain.toArray(new Certificate[0]);
            }
        } catch (Exception e) {
            // An unparsable chain still leaves the leaf, which is enough to sign.
        }
        return new Certificate[] {entry.certificate()};
    }

    @Override
    public Certificate engineGetCertificate(String alias) {
        Entry entry = entries.get(alias);
        return entry == null ? null : entry.certificate();
    }

    @Override
    public Date engineGetCreationDate(String alias) {
        return null;
    }

    @Override
    public Enumeration<String> engineAliases() {
        return Collections.enumeration(entries.keySet());
    }

    @Override
    public boolean engineContainsAlias(String alias) {
        return entries.containsKey(alias);
    }

    @Override
    public int engineSize() {
        return entries.size();
    }

    @Override
    public boolean engineIsKeyEntry(String alias) {
        return entries.containsKey(alias);
    }

    @Override
    public boolean engineIsCertificateEntry(String alias) {
        return false;
    }

    @Override
    public String engineGetCertificateAlias(Certificate cert) {
        return entries.entrySet().stream()
                .filter(e -> e.getValue().certificate().equals(cert))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse(null);
    }

    @Override
    public void engineSetKeyEntry(String alias, Key key, char[] password, Certificate[] chain)
            throws KeyStoreException {
        throw new KeyStoreException("The macOS keychain is read-only here");
    }

    @Override
    public void engineSetKeyEntry(String alias, byte[] key, Certificate[] chain)
            throws KeyStoreException {
        throw new KeyStoreException("The macOS keychain is read-only here");
    }

    @Override
    public void engineSetCertificateEntry(String alias, Certificate cert) throws KeyStoreException {
        throw new KeyStoreException("The macOS keychain is read-only here");
    }

    @Override
    public void engineDeleteEntry(String alias) throws KeyStoreException {
        throw new KeyStoreException("The macOS keychain is read-only here");
    }

    @Override
    public void engineStore(OutputStream stream, char[] password) {
        throw new UnsupportedOperationException("The macOS keychain is read-only here");
    }
}
