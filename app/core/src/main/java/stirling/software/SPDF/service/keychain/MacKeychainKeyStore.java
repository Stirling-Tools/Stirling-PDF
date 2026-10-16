package stirling.software.SPDF.service.keychain;

import java.security.Key;
import java.security.KeyStore;
import java.security.KeyStoreSpi;
import java.security.PrivateKey;
import java.security.Provider;
import java.security.cert.Certificate;
import java.util.Date;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** In-memory keystore exposing a single macOS Keychain identity to PDFBox/BouncyCastle. */
final class MacKeychainKeyStoreSpi extends KeyStoreSpi {

    private final Map<String, Entry> entries = new HashMap<>();

    void setIdentity(String alias, Certificate[] chain, PrivateKey privateKey) {
        entries.put(alias, new Entry(chain, privateKey));
    }

    @Override
    public Key engineGetKey(String alias, char[] password) {
        Entry entry = entries.get(alias);
        return entry == null ? null : entry.privateKey();
    }

    @Override
    public Certificate[] engineGetCertificateChain(String alias) {
        Entry entry = entries.get(alias);
        return entry == null ? null : entry.chain();
    }

    @Override
    public Certificate engineGetCertificate(String alias) {
        Entry entry = entries.get(alias);
        return entry == null || entry.chain().length == 0 ? null : entry.chain()[0];
    }

    @Override
    public Date engineGetCreationDate(String alias) {
        return entries.containsKey(alias) ? new Date() : null;
    }

    @Override
    public void engineSetKeyEntry(String alias, Key key, char[] password, Certificate[] chain) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void engineSetKeyEntry(String alias, byte[] key, Certificate[] chain) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void engineSetCertificateEntry(String alias, Certificate cert) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void engineDeleteEntry(String alias) {
        entries.remove(alias);
    }

    @Override
    public Enumeration<String> engineAliases() {
        Iterator<String> iterator = entries.keySet().iterator();
        return new Enumeration<>() {
            @Override
            public boolean hasMoreElements() {
                return iterator.hasNext();
            }

            @Override
            public String nextElement() {
                return iterator.next();
            }
        };
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
        return null;
    }

    @Override
    public void engineStore(java.io.OutputStream stream, char[] password) {
        throw new UnsupportedOperationException();
    }

    @Override
    public void engineLoad(java.io.InputStream stream, char[] password) {
        // Populated programmatically after load().
    }

    private record Entry(Certificate[] chain, PrivateKey privateKey) {}
}

final class MacKeychainProvider extends Provider {

    private static final MacKeychainProvider INSTANCE = new MacKeychainProvider();

    private MacKeychainProvider() {
        super("MacKeychain", "1.0", "macOS Keychain signing via helper");
        putService(
                new Service(
                        this,
                        "Signature",
                        "SHA256withRSA",
                        MacKeychainSignatureSpi.class.getName(),
                        null,
                        null));
        putService(
                new Service(
                        this,
                        "Signature",
                        "SHA256withECDSA",
                        MacKeychainSignatureSpi.class.getName(),
                        null,
                        null));
        putService(
                new Service(
                        this,
                        "Signature",
                        "SHA1withRSA",
                        MacKeychainSignatureSpi.class.getName(),
                        null,
                        null));
    }

    static Provider getInstance() {
        return INSTANCE;
    }
}

/** Factory for the single-entry keystore used during macOS Keychain signing. */
public final class MacKeychainKeyStore {

    private MacKeychainKeyStore() {}

    public static KeyStore create(String alias, Certificate[] chain, PrivateKey privateKey)
            throws Exception {
        MacKeychainKeyStoreSpi spi = new MacKeychainKeyStoreSpi();
        spi.setIdentity(alias, chain, privateKey);
        // KeyStore(spi, ...) does not mark the store initialized; PDFBox calls
        // containsAlias() which requires load() first.
        KeyStore keyStore = new KeyStore(spi, MacKeychainProvider.getInstance(), "MacKeychain") {};
        keyStore.load(null, null);
        return keyStore;
    }

    public static Provider provider() {
        return MacKeychainProvider.getInstance();
    }
}
