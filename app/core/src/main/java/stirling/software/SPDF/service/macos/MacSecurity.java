package stirling.software.SPDF.service.macos;

import static java.lang.foreign.ValueLayout.ADDRESS;
import static java.lang.foreign.ValueLayout.JAVA_BYTE;
import static java.lang.foreign.ValueLayout.JAVA_INT;
import static java.lang.foreign.ValueLayout.JAVA_LONG;

import java.lang.foreign.Arena;
import java.lang.foreign.FunctionDescriptor;
import java.lang.foreign.Linker;
import java.lang.foreign.MemorySegment;
import java.lang.foreign.SymbolLookup;
import java.lang.invoke.MethodHandle;
import java.lang.ref.Cleaner;
import java.nio.charset.StandardCharsets;
import java.security.SignatureException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Bindings to Security.framework for signing with keychain identities, including smart cards and
 * YubiKeys that macOS exposes through CryptoTokenKit. Java's own Apple KeychainStore can only
 * export software keys, so token keys are unreachable without these calls; the private key stays on
 * the token and macOS shows its own PIN prompt.
 *
 * <p>Every CoreFoundation object this class returns to Java is retained and released by a {@link
 * Cleaner}, so an {@link Identity} is safe to hold for the life of a keystore.
 */
final class MacSecurity {

    private static final String SECURITY = "/System/Library/Frameworks/Security.framework/Security";
    private static final String CORE_FOUNDATION =
            "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
    private static final int CF_STRING_ENCODING_UTF8 = 0x08000100;
    private static final int ERR_SEC_ITEM_NOT_FOUND = -25300;
    private static final long ERR_SEC_USER_CANCELED = -128;

    private static final Cleaner CLEANER = Cleaner.create();
    private static volatile MacSecurity instance;
    private static volatile Throwable loadFailure;

    private final SymbolLookup security;
    private final SymbolLookup coreFoundation;
    private final MethodHandle cfRelease;
    private final MethodHandle cfRetain;
    private final MethodHandle cfDictionaryCreate;
    private final MethodHandle cfArrayGetCount;
    private final MethodHandle cfArrayGetValueAtIndex;
    private final MethodHandle cfDataCreate;
    private final MethodHandle cfDataGetLength;
    private final MethodHandle cfDataGetBytePtr;
    private final MethodHandle cfStringGetCString;
    private final MethodHandle cfErrorGetCode;
    private final MethodHandle cfErrorCopyDescription;
    private final MethodHandle secItemCopyMatching;
    private final MethodHandle secIdentityCopyCertificate;
    private final MethodHandle secIdentityCopyPrivateKey;
    private final MethodHandle secCertificateCopyData;
    private final MethodHandle secKeyCreateSignature;
    private final MethodHandle secPolicyCreateBasicX509;
    private final MethodHandle secTrustCreateWithCertificates;
    private final MethodHandle secTrustEvaluateWithError;
    private final MethodHandle secTrustSetNetworkFetchAllowed;
    private final MethodHandle secTrustCopyCertificateChain;
    private final MethodHandle secTrustGetCertificateCount;
    private final MethodHandle secTrustGetCertificateAtIndex;

    /**
     * A keychain identity: its certificate, a retained native reference used for signing, and
     * whether its key lives on a token (smart card, YubiKey) rather than in a keychain file.
     */
    record Identity(byte[] certificateDer, MemorySegment ref, boolean onToken) {}

    private MacSecurity() {
        Linker linker = Linker.nativeLinker();
        security = SymbolLookup.libraryLookup(SECURITY, Arena.global());
        coreFoundation = SymbolLookup.libraryLookup(CORE_FOUNDATION, Arena.global());

        cfRelease = cf(linker, "CFRelease", FunctionDescriptor.ofVoid(ADDRESS));
        cfRetain = cf(linker, "CFRetain", FunctionDescriptor.of(ADDRESS, ADDRESS));
        cfDictionaryCreate =
                cf(
                        linker,
                        "CFDictionaryCreate",
                        FunctionDescriptor.of(
                                ADDRESS, ADDRESS, ADDRESS, ADDRESS, JAVA_LONG, ADDRESS, ADDRESS));
        cfArrayGetCount = cf(linker, "CFArrayGetCount", FunctionDescriptor.of(JAVA_LONG, ADDRESS));
        cfArrayGetValueAtIndex =
                cf(
                        linker,
                        "CFArrayGetValueAtIndex",
                        FunctionDescriptor.of(ADDRESS, ADDRESS, JAVA_LONG));
        cfDataCreate =
                cf(
                        linker,
                        "CFDataCreate",
                        FunctionDescriptor.of(ADDRESS, ADDRESS, ADDRESS, JAVA_LONG));
        cfDataGetLength = cf(linker, "CFDataGetLength", FunctionDescriptor.of(JAVA_LONG, ADDRESS));
        cfDataGetBytePtr = cf(linker, "CFDataGetBytePtr", FunctionDescriptor.of(ADDRESS, ADDRESS));
        cfStringGetCString =
                cf(
                        linker,
                        "CFStringGetCString",
                        FunctionDescriptor.of(JAVA_BYTE, ADDRESS, ADDRESS, JAVA_LONG, JAVA_INT));
        cfErrorGetCode = cf(linker, "CFErrorGetCode", FunctionDescriptor.of(JAVA_LONG, ADDRESS));
        cfErrorCopyDescription =
                cf(linker, "CFErrorCopyDescription", FunctionDescriptor.of(ADDRESS, ADDRESS));

        secItemCopyMatching =
                sec(
                        linker,
                        "SecItemCopyMatching",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS));
        secIdentityCopyCertificate =
                sec(
                        linker,
                        "SecIdentityCopyCertificate",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS));
        secIdentityCopyPrivateKey =
                sec(
                        linker,
                        "SecIdentityCopyPrivateKey",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS));
        secCertificateCopyData =
                sec(linker, "SecCertificateCopyData", FunctionDescriptor.of(ADDRESS, ADDRESS));
        secKeyCreateSignature =
                sec(
                        linker,
                        "SecKeyCreateSignature",
                        FunctionDescriptor.of(ADDRESS, ADDRESS, ADDRESS, ADDRESS, ADDRESS));
        secPolicyCreateBasicX509 =
                sec(linker, "SecPolicyCreateBasicX509", FunctionDescriptor.of(ADDRESS));
        secTrustCreateWithCertificates =
                sec(
                        linker,
                        "SecTrustCreateWithCertificates",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS, ADDRESS));
        secTrustEvaluateWithError =
                sec(
                        linker,
                        "SecTrustEvaluateWithError",
                        FunctionDescriptor.of(JAVA_BYTE, ADDRESS, ADDRESS));
        secTrustSetNetworkFetchAllowed =
                sec(
                        linker,
                        "SecTrustSetNetworkFetchAllowed",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, JAVA_BYTE));
        secTrustCopyCertificateChain =
                security.find("SecTrustCopyCertificateChain")
                        .map(
                                address ->
                                        linker.downcallHandle(
                                                address, FunctionDescriptor.of(ADDRESS, ADDRESS)))
                        .orElse(null);
        if (secTrustCopyCertificateChain == null) {
            secTrustGetCertificateCount =
                    sec(
                            linker,
                            "SecTrustGetCertificateCount",
                            FunctionDescriptor.of(JAVA_LONG, ADDRESS));
            secTrustGetCertificateAtIndex =
                    sec(
                            linker,
                            "SecTrustGetCertificateAtIndex",
                            FunctionDescriptor.of(ADDRESS, ADDRESS, JAVA_LONG));
        } else {
            secTrustGetCertificateCount = null;
            secTrustGetCertificateAtIndex = null;
        }
    }

    static boolean isMacOs() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac");
    }

    /** The bindings, or {@code null} when not on macOS or Security.framework cannot be bound. */
    static MacSecurity get() {
        if (!isMacOs()) {
            return null;
        }
        MacSecurity bound = instance;
        if (bound != null || loadFailure != null) {
            return bound;
        }
        synchronized (MacSecurity.class) {
            if (instance == null && loadFailure == null) {
                try {
                    instance = new MacSecurity();
                } catch (Throwable t) {
                    loadFailure = t;
                }
            }
            return instance;
        }
    }

    static Throwable loadFailure() {
        return loadFailure;
    }

    /**
     * Every identity in the user's keychain search list plus every identity on an inserted token.
     * Token items live only in the token access group, so they need a second query; duplicates are
     * dropped by certificate.
     */
    List<Identity> listIdentities() throws Exception {
        Map<String, Identity> byCert = new LinkedHashMap<>();
        for (boolean tokens : new boolean[] {true, false}) {
            for (Identity identity : queryIdentities(tokens)) {
                byCert.putIfAbsent(
                        java.util.HexFormat.of().formatHex(identity.certificateDer()), identity);
            }
        }
        return new ArrayList<>(byCert.values());
    }

    private List<Identity> queryIdentities(boolean tokensOnly) throws Exception {
        try {
            return queryIdentitiesNative(tokensOnly);
        } catch (Exception | Error e) {
            throw e;
        } catch (Throwable t) {
            throw new IllegalStateException("Keychain query failed: " + t.getMessage(), t);
        }
    }

    private List<Identity> queryIdentitiesNative(boolean tokensOnly) throws Throwable {
        List<Identity> identities = new ArrayList<>();
        try (Arena arena = Arena.ofConfined()) {
            List<MemorySegment> keys = new ArrayList<>();
            List<MemorySegment> values = new ArrayList<>();
            keys.add(constant("kSecClass"));
            values.add(constant("kSecClassIdentity"));
            keys.add(constant("kSecMatchLimit"));
            values.add(constant("kSecMatchLimitAll"));
            keys.add(constant("kSecReturnRef"));
            values.add(cfBooleanTrue());
            if (tokensOnly) {
                keys.add(constant("kSecAttrAccessGroup"));
                values.add(constant("kSecAttrAccessGroupToken"));
            }
            MemorySegment query = dictionary(arena, keys, values);
            MemorySegment resultOut = arena.allocate(ADDRESS);
            int status;
            try {
                status = (int) secItemCopyMatching.invokeExact(query, resultOut);
            } finally {
                release(query);
            }
            if (status == ERR_SEC_ITEM_NOT_FOUND) {
                return identities;
            }
            if (status != 0) {
                throw new IllegalStateException("SecItemCopyMatching failed: OSStatus " + status);
            }
            MemorySegment array = resultOut.get(ADDRESS, 0);
            try {
                long count = (long) cfArrayGetCount.invokeExact(array);
                for (long i = 0; i < count; i++) {
                    MemorySegment identity =
                            (MemorySegment) cfArrayGetValueAtIndex.invokeExact(array, i);
                    byte[] der = certificateOf(arena, identity);
                    if (der != null) {
                        identities.add(new Identity(der, retain(identity), tokensOnly));
                    }
                }
            } finally {
                release(array);
            }
        }
        return identities;
    }

    private byte[] certificateOf(Arena arena, MemorySegment identity) throws Throwable {
        MemorySegment certOut = arena.allocate(ADDRESS);
        int status = (int) secIdentityCopyCertificate.invokeExact(identity, certOut);
        if (status != 0) {
            return null;
        }
        MemorySegment cert = certOut.get(ADDRESS, 0);
        try {
            return certificateBytes(cert);
        } finally {
            release(cert);
        }
    }

    /**
     * The identity's certificate chain as macOS builds it, leaf first: intermediates come from the
     * keychains, the token and, where the certificate names one, its issuer URL. Whether the chain
     * is trusted is ignored here; validation decides that. Falls back to the leaf alone.
     */
    List<byte[]> certificateChain(MemorySegment identity) {
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment certOut = arena.allocate(ADDRESS);
            if ((int) secIdentityCopyCertificate.invokeExact(identity, certOut) != 0) {
                return List.of();
            }
            MemorySegment cert = certOut.get(ADDRESS, 0);
            MemorySegment policy = (MemorySegment) secPolicyCreateBasicX509.invokeExact();
            MemorySegment trustOut = arena.allocate(ADDRESS);
            try {
                int status =
                        (int) secTrustCreateWithCertificates.invokeExact(cert, policy, trustOut);
                if (status != 0) {
                    return List.of(certificateBytes(cert));
                }
                MemorySegment trust = trustOut.get(ADDRESS, 0);
                try {
                    // A basic X.509 policy leaves fetching off, so an intermediate published
                    // only at the certificate's issuer URL would be missing from the chain.
                    int fetchIgnored =
                            (int) secTrustSetNetworkFetchAllowed.invokeExact(trust, (byte) 1);
                    byte ignored =
                            (byte) secTrustEvaluateWithError.invokeExact(trust, MemorySegment.NULL);
                    List<byte[]> chain = trustChain(trust);
                    return chain.isEmpty() ? List.of(certificateBytes(cert)) : chain;
                } finally {
                    release(trust);
                }
            } finally {
                release(policy);
                release(cert);
            }
        } catch (Throwable t) {
            return List.of();
        }
    }

    private List<byte[]> trustChain(MemorySegment trust) throws Throwable {
        List<byte[]> certificates = new ArrayList<>();
        if (secTrustCopyCertificateChain == null) {
            // The legacy accessors borrow certificates from the evaluated trust on macOS 11.
            long count = (long) secTrustGetCertificateCount.invokeExact(trust);
            for (long i = 0; i < count; i++) {
                MemorySegment cert =
                        (MemorySegment) secTrustGetCertificateAtIndex.invokeExact(trust, i);
                if (cert.equals(MemorySegment.NULL)) {
                    break;
                }
                certificates.add(certificateBytes(cert));
            }
            return certificates;
        }
        MemorySegment chain = (MemorySegment) secTrustCopyCertificateChain.invokeExact(trust);
        if (chain.equals(MemorySegment.NULL)) {
            return certificates;
        }
        try {
            long count = (long) cfArrayGetCount.invokeExact(chain);
            for (long i = 0; i < count; i++) {
                MemorySegment cert = (MemorySegment) cfArrayGetValueAtIndex.invokeExact(chain, i);
                certificates.add(certificateBytes(cert));
            }
            return certificates;
        } finally {
            release(chain);
        }
    }

    private byte[] certificateBytes(MemorySegment cert) throws Throwable {
        MemorySegment data = (MemorySegment) secCertificateCopyData.invokeExact(cert);
        try {
            return bytes(data);
        } finally {
            release(data);
        }
    }

    /**
     * Sign {@code message} with the identity's private key. {@code algorithm} is the name of a
     * {@code kSecKeyAlgorithm*Message*} constant, so Security.framework hashes the message itself.
     */
    byte[] sign(MemorySegment identity, String algorithm, byte[] message)
            throws SignatureException {
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment keyOut = arena.allocate(ADDRESS);
            int status = (int) secIdentityCopyPrivateKey.invokeExact(identity, keyOut);
            if (status != 0) {
                throw new SignatureException(
                        "The keychain did not release the signing key: OSStatus " + status);
            }
            MemorySegment key = keyOut.get(ADDRESS, 0);
            MemorySegment input = MemorySegment.NULL;
            try {
                MemorySegment buffer = arena.allocate(Math.max(1, message.length));
                MemorySegment.copy(message, 0, buffer, JAVA_BYTE, 0, message.length);
                input =
                        (MemorySegment)
                                cfDataCreate.invokeExact(
                                        MemorySegment.NULL, buffer, (long) message.length);
                MemorySegment errorOut = arena.allocate(ADDRESS);
                errorOut.set(ADDRESS, 0, MemorySegment.NULL);
                MemorySegment signature =
                        (MemorySegment)
                                secKeyCreateSignature.invokeExact(
                                        key, constant(algorithm), input, errorOut);
                if (signature.equals(MemorySegment.NULL)) {
                    throw signatureFailure(errorOut.get(ADDRESS, 0));
                }
                try {
                    return bytes(signature);
                } finally {
                    release(signature);
                }
            } finally {
                release(input);
                release(key);
            }
        } catch (SignatureException e) {
            throw e;
        } catch (Throwable t) {
            throw new SignatureException("Keychain signing failed: " + t.getMessage(), t);
        }
    }

    private SignatureException signatureFailure(MemorySegment error) throws Throwable {
        if (error.equals(MemorySegment.NULL)) {
            return new SignatureException("Keychain signing failed");
        }
        try {
            long code = (long) cfErrorGetCode.invokeExact(error);
            if (code == ERR_SEC_USER_CANCELED) {
                return new SignatureException("Signing was cancelled at the PIN prompt");
            }
            MemorySegment description = (MemorySegment) cfErrorCopyDescription.invokeExact(error);
            try {
                return new SignatureException(
                        "Keychain signing failed (" + code + "): " + string(description));
            } finally {
                release(description);
            }
        } finally {
            release(error);
        }
    }

    private MemorySegment dictionary(
            Arena arena, List<MemorySegment> keys, List<MemorySegment> values) throws Throwable {
        MemorySegment keyArray = arena.allocate(ADDRESS, keys.size());
        MemorySegment valueArray = arena.allocate(ADDRESS, values.size());
        for (int i = 0; i < keys.size(); i++) {
            keyArray.setAtIndex(ADDRESS, i, keys.get(i));
            valueArray.setAtIndex(ADDRESS, i, values.get(i));
        }
        return (MemorySegment)
                cfDictionaryCreate.invokeExact(
                        MemorySegment.NULL,
                        keyArray,
                        valueArray,
                        (long) keys.size(),
                        symbol(coreFoundation, "kCFTypeDictionaryKeyCallBacks"),
                        symbol(coreFoundation, "kCFTypeDictionaryValueCallBacks"));
    }

    private MemorySegment retain(MemorySegment ref) throws Throwable {
        MemorySegment retained = (MemorySegment) cfRetain.invokeExact(ref);
        long address = retained.address();
        CLEANER.register(retained, () -> releaseAddress(address));
        return retained;
    }

    private void releaseAddress(long address) {
        try {
            release(MemorySegment.ofAddress(address));
        } catch (Throwable ignored) {
            // Release on a GC thread must never throw.
        }
    }

    private void release(MemorySegment ref) throws Throwable {
        if (ref != null && !ref.equals(MemorySegment.NULL)) {
            cfRelease.invokeExact(ref);
        }
    }

    private byte[] bytes(MemorySegment data) throws Throwable {
        long length = (long) cfDataGetLength.invokeExact(data);
        MemorySegment ptr = (MemorySegment) cfDataGetBytePtr.invokeExact(data);
        return ptr.reinterpret(length).toArray(JAVA_BYTE);
    }

    private String string(MemorySegment cfString) throws Throwable {
        if (cfString.equals(MemorySegment.NULL)) {
            return "";
        }
        try (Arena arena = Arena.ofConfined()) {
            long size = 1024;
            MemorySegment buffer = arena.allocate(size);
            byte ok =
                    (byte)
                            cfStringGetCString.invokeExact(
                                    cfString, buffer, size, CF_STRING_ENCODING_UTF8);
            return ok == 0 ? "" : buffer.getString(0, StandardCharsets.UTF_8);
        }
    }

    private MemorySegment cfBooleanTrue() {
        return constantIn(coreFoundation, "kCFBooleanTrue");
    }

    private MemorySegment constant(String name) {
        return constantIn(security, name);
    }

    private static MemorySegment constantIn(SymbolLookup lookup, String name) {
        return symbol(lookup, name).reinterpret(ADDRESS.byteSize()).get(ADDRESS, 0);
    }

    private static MemorySegment symbol(SymbolLookup lookup, String name) {
        return lookup.find(name)
                .orElseThrow(() -> new IllegalStateException("Missing native symbol " + name));
    }

    private MethodHandle cf(Linker linker, String name, FunctionDescriptor descriptor) {
        return linker.downcallHandle(symbol(coreFoundation, name), descriptor);
    }

    private MethodHandle sec(Linker linker, String name, FunctionDescriptor descriptor) {
        return linker.downcallHandle(symbol(security, name), descriptor);
    }
}
