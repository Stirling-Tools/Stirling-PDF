package stirling.software.SPDF.service.windows;

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
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.OptionalInt;

/**
 * Bindings to crypt32, ncrypt and advapi32 that read where the private key of a certificate in the
 * current user's personal store is held. Every call is silent: nothing here opens a PIN prompt or
 * touches key material.
 */
final class WindowsCrypto implements WindowsKeyLocation.ImplTypeLookup {

    private static final int ENCODING_X509_AND_PKCS7 = 0x00010001;
    private static final int CERT_FIND_SHA1_HASH = 0x00010000;
    private static final int CERT_KEY_PROV_INFO_PROP_ID = 2;
    private static final int CERT_NCRYPT_KEY_SPEC = 0xFFFFFFFF;
    private static final int CRYPT_MACHINE_KEYSET = 0x20;
    private static final int CRYPT_SILENT = 0x40;
    private static final int NCRYPT_MACHINE_KEY_FLAG = 0x20;
    private static final int NCRYPT_SILENT_FLAG = 0x40;
    private static final int PP_IMPTYPE = 3;
    private static final String NCRYPT_IMPL_TYPE_PROPERTY = "Impl Type";

    // CRYPT_KEY_PROV_INFO on 64-bit Windows; the 4 bytes after cProvParam are alignment padding.
    private static final long PROV_INFO_CONTAINER_NAME = 0;
    private static final long PROV_INFO_PROV_NAME = 8;
    private static final long PROV_INFO_PROV_TYPE = 16;
    private static final long PROV_INFO_FLAGS = 20;
    private static final long PROV_INFO_KEY_SPEC = 40;
    private static final long PROV_INFO_SIZE = 48;

    private static volatile WindowsCrypto instance;
    private static volatile boolean loadFailed;

    private final MethodHandle certOpenSystemStore;
    private final MethodHandle certFindCertificateInStore;
    private final MethodHandle certGetCertificateContextProperty;
    private final MethodHandle certFreeCertificateContext;
    private final MethodHandle certCloseStore;
    private final MethodHandle nCryptOpenStorageProvider;
    private final MethodHandle nCryptOpenKey;
    private final MethodHandle nCryptGetProperty;
    private final MethodHandle nCryptFreeObject;
    private final MethodHandle cryptAcquireContext;
    private final MethodHandle cryptGetProvParam;
    private final MethodHandle cryptReleaseContext;

    private WindowsCrypto() {
        Linker linker = Linker.nativeLinker();
        SymbolLookup crypt32 = SymbolLookup.libraryLookup("crypt32.dll", Arena.global());
        SymbolLookup ncrypt = SymbolLookup.libraryLookup("ncrypt.dll", Arena.global());
        SymbolLookup advapi32 = SymbolLookup.libraryLookup("advapi32.dll", Arena.global());

        certOpenSystemStore =
                bind(
                        linker,
                        crypt32,
                        "CertOpenSystemStoreW",
                        FunctionDescriptor.of(ADDRESS, JAVA_LONG, ADDRESS));
        certFindCertificateInStore =
                bind(
                        linker,
                        crypt32,
                        "CertFindCertificateInStore",
                        FunctionDescriptor.of(
                                ADDRESS, ADDRESS, JAVA_INT, JAVA_INT, JAVA_INT, ADDRESS, ADDRESS));
        certGetCertificateContextProperty =
                bind(
                        linker,
                        crypt32,
                        "CertGetCertificateContextProperty",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, JAVA_INT, ADDRESS, ADDRESS));
        certFreeCertificateContext =
                bind(
                        linker,
                        crypt32,
                        "CertFreeCertificateContext",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS));
        certCloseStore =
                bind(
                        linker,
                        crypt32,
                        "CertCloseStore",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, JAVA_INT));
        nCryptOpenStorageProvider =
                bind(
                        linker,
                        ncrypt,
                        "NCryptOpenStorageProvider",
                        FunctionDescriptor.of(JAVA_INT, ADDRESS, ADDRESS, JAVA_INT));
        nCryptOpenKey =
                bind(
                        linker,
                        ncrypt,
                        "NCryptOpenKey",
                        FunctionDescriptor.of(
                                JAVA_INT, JAVA_LONG, ADDRESS, ADDRESS, JAVA_INT, JAVA_INT));
        nCryptGetProperty =
                bind(
                        linker,
                        ncrypt,
                        "NCryptGetProperty",
                        FunctionDescriptor.of(
                                JAVA_INT, JAVA_LONG, ADDRESS, ADDRESS, JAVA_INT, ADDRESS,
                                JAVA_INT));
        nCryptFreeObject =
                bind(
                        linker,
                        ncrypt,
                        "NCryptFreeObject",
                        FunctionDescriptor.of(JAVA_INT, JAVA_LONG));
        cryptAcquireContext =
                bind(
                        linker,
                        advapi32,
                        "CryptAcquireContextW",
                        FunctionDescriptor.of(
                                JAVA_INT, ADDRESS, ADDRESS, ADDRESS, JAVA_INT, JAVA_INT));
        cryptGetProvParam =
                bind(
                        linker,
                        advapi32,
                        "CryptGetProvParam",
                        FunctionDescriptor.of(
                                JAVA_INT, JAVA_LONG, JAVA_INT, ADDRESS, ADDRESS, JAVA_INT));
        cryptReleaseContext =
                bind(
                        linker,
                        advapi32,
                        "CryptReleaseContext",
                        FunctionDescriptor.of(JAVA_INT, JAVA_LONG, JAVA_INT));
    }

    /** The bindings, or {@code null} when not on Windows or the libraries cannot be bound. */
    static WindowsCrypto get() {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            return null;
        }
        WindowsCrypto bound = instance;
        if (bound != null || loadFailed) {
            return bound;
        }
        synchronized (WindowsCrypto.class) {
            if (instance == null && !loadFailed) {
                try {
                    instance = new WindowsCrypto();
                } catch (Throwable t) {
                    loadFailed = true;
                }
            }
            return instance;
        }
    }

    /**
     * The implementation flags of the private key behind the certificate with this SHA-1 thumbprint
     * in the current user's personal store: {@code NCRYPT_IMPL_TYPE_PROPERTY} for a CNG key, {@code
     * PP_IMPTYPE} for a CryptoAPI one. Empty when the certificate, its key provider info or the key
     * cannot be found.
     */
    @Override
    public OptionalInt implType(byte[] sha1Thumbprint) throws Throwable {
        try (Arena arena = Arena.ofConfined()) {
            MemorySegment store =
                    (MemorySegment) certOpenSystemStore.invokeExact(0L, wide(arena, "MY"));
            if (store.equals(MemorySegment.NULL)) {
                return OptionalInt.empty();
            }
            try {
                return implTypeInStore(arena, store, sha1Thumbprint);
            } finally {
                int ignored = (int) certCloseStore.invokeExact(store, 0);
            }
        }
    }

    private OptionalInt implTypeInStore(Arena arena, MemorySegment store, byte[] sha1)
            throws Throwable {
        MemorySegment hashBytes = arena.allocateFrom(JAVA_BYTE, sha1);
        MemorySegment hashBlob = arena.allocate(16, 8);
        hashBlob.set(JAVA_INT, 0, sha1.length);
        hashBlob.set(ADDRESS, 8, hashBytes);

        MemorySegment certContext =
                (MemorySegment)
                        certFindCertificateInStore.invokeExact(
                                store,
                                ENCODING_X509_AND_PKCS7,
                                0,
                                CERT_FIND_SHA1_HASH,
                                hashBlob,
                                MemorySegment.NULL);
        if (certContext.equals(MemorySegment.NULL)) {
            return OptionalInt.empty();
        }
        try {
            MemorySegment provInfo = keyProvInfo(arena, certContext);
            if (provInfo == null) {
                return OptionalInt.empty();
            }
            return implTypeOfKey(arena, provInfo);
        } finally {
            int ignored = (int) certFreeCertificateContext.invokeExact(certContext);
        }
    }

    private MemorySegment keyProvInfo(Arena arena, MemorySegment certContext) throws Throwable {
        MemorySegment size = arena.allocate(JAVA_INT);
        int ok =
                (int)
                        certGetCertificateContextProperty.invokeExact(
                                certContext, CERT_KEY_PROV_INFO_PROP_ID, MemorySegment.NULL, size);
        if (ok == 0 || size.get(JAVA_INT, 0) < PROV_INFO_SIZE) {
            return null;
        }
        MemorySegment buffer = arena.allocate(size.get(JAVA_INT, 0), 8);
        ok =
                (int)
                        certGetCertificateContextProperty.invokeExact(
                                certContext, CERT_KEY_PROV_INFO_PROP_ID, buffer, size);
        return ok == 0 ? null : buffer;
    }

    private OptionalInt implTypeOfKey(Arena arena, MemorySegment provInfo) throws Throwable {
        MemorySegment container = provInfo.get(ADDRESS, PROV_INFO_CONTAINER_NAME);
        MemorySegment provider = provInfo.get(ADDRESS, PROV_INFO_PROV_NAME);
        int provType = provInfo.get(JAVA_INT, PROV_INFO_PROV_TYPE);
        int flags = provInfo.get(JAVA_INT, PROV_INFO_FLAGS);
        int keySpec = provInfo.get(JAVA_INT, PROV_INFO_KEY_SPEC);
        if (container.equals(MemorySegment.NULL) || provider.equals(MemorySegment.NULL)) {
            return OptionalInt.empty();
        }
        boolean machineKey = (flags & CRYPT_MACHINE_KEYSET) != 0;
        return provType == 0
                ? cngImplType(arena, provider, container, keySpec, machineKey)
                : capiImplType(arena, provider, container, provType, machineKey);
    }

    private OptionalInt cngImplType(
            Arena arena,
            MemorySegment provider,
            MemorySegment container,
            int keySpec,
            boolean machineKey)
            throws Throwable {
        MemorySegment providerHandle = arena.allocate(JAVA_LONG);
        int status = (int) nCryptOpenStorageProvider.invokeExact(providerHandle, provider, 0);
        if (status != 0) {
            return OptionalInt.empty();
        }
        long hProvider = providerHandle.get(JAVA_LONG, 0);
        try {
            MemorySegment keyHandle = arena.allocate(JAVA_LONG);
            int openFlags = NCRYPT_SILENT_FLAG | (machineKey ? NCRYPT_MACHINE_KEY_FLAG : 0);
            status =
                    (int)
                            nCryptOpenKey.invokeExact(
                                    hProvider,
                                    keyHandle,
                                    container,
                                    keySpec == CERT_NCRYPT_KEY_SPEC ? 0 : keySpec,
                                    openFlags);
            if (status != 0) {
                return OptionalInt.empty();
            }
            long hKey = keyHandle.get(JAVA_LONG, 0);
            try {
                // NCRYPT_IMPL_TYPE_PROPERTY is documented on the key storage provider; some
                // providers answer it for a key too. Ask the key first, then its provider, so a
                // provider that only answers at its own level still marks the ID.
                OptionalInt keyType = nCryptImplType(arena, hKey);
                return keyType.isPresent() ? keyType : nCryptImplType(arena, hProvider);
            } finally {
                int ignored = (int) nCryptFreeObject.invokeExact(hKey);
            }
        } finally {
            int ignored = (int) nCryptFreeObject.invokeExact(hProvider);
        }
    }

    private OptionalInt nCryptImplType(Arena arena, long handle) throws Throwable {
        MemorySegment value = arena.allocate(JAVA_INT);
        MemorySegment written = arena.allocate(JAVA_INT);
        int status =
                (int)
                        nCryptGetProperty.invokeExact(
                                handle,
                                wide(arena, NCRYPT_IMPL_TYPE_PROPERTY),
                                value,
                                (int) JAVA_INT.byteSize(),
                                written,
                                NCRYPT_SILENT_FLAG);
        if (status != 0 || written.get(JAVA_INT, 0) != JAVA_INT.byteSize()) {
            return OptionalInt.empty();
        }
        return OptionalInt.of(value.get(JAVA_INT, 0));
    }

    private OptionalInt capiImplType(
            Arena arena,
            MemorySegment provider,
            MemorySegment container,
            int provType,
            boolean machineKey)
            throws Throwable {
        MemorySegment contextHandle = arena.allocate(JAVA_LONG);
        int acquireFlags = CRYPT_SILENT | (machineKey ? CRYPT_MACHINE_KEYSET : 0);
        int ok =
                (int)
                        cryptAcquireContext.invokeExact(
                                contextHandle, container, provider, provType, acquireFlags);
        if (ok == 0) {
            return OptionalInt.empty();
        }
        long hProv = contextHandle.get(JAVA_LONG, 0);
        try {
            MemorySegment value = arena.allocate(JAVA_INT);
            MemorySegment length = arena.allocate(JAVA_INT);
            length.set(JAVA_INT, 0, (int) JAVA_INT.byteSize());
            ok = (int) cryptGetProvParam.invokeExact(hProv, PP_IMPTYPE, value, length, 0);
            if (ok == 0 || length.get(JAVA_INT, 0) != JAVA_INT.byteSize()) {
                return OptionalInt.empty();
            }
            return OptionalInt.of(value.get(JAVA_INT, 0));
        } finally {
            int ignored = (int) cryptReleaseContext.invokeExact(hProv, 0);
        }
    }

    private static MemorySegment wide(Arena arena, String value) {
        return arena.allocateFrom(value, StandardCharsets.UTF_16LE);
    }

    private static MethodHandle bind(
            Linker linker, SymbolLookup library, String name, FunctionDescriptor descriptor) {
        return linker.downcallHandle(
                library.find(name)
                        .orElseThrow(
                                () -> new IllegalStateException("Missing native symbol " + name)),
                descriptor);
    }
}
