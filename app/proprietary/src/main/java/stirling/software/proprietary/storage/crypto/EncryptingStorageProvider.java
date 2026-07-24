package stirling.software.proprietary.storage.crypto;

import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.SequenceInputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

import org.springframework.core.io.AbstractResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import com.google.crypto.tink.subtle.AesGcmHkdfStreaming;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.provider.StoredObject;

/**
 * Envelope-encryption decorator over any {@link StorageProvider}: encrypts on {@code store},
 * decrypts on {@code load}, and passes legacy plaintext blobs through untouched (detected by the
 * {@link EncryptedFileFormat} magic). Backends store opaque ciphertext and need no changes.
 *
 * <p>{@code writeEnabled=false} keeps decryption working after the feature is switched off, so
 * existing encrypted content never goes dark; only new writes revert to plaintext.
 *
 * <p>Presigned download URLs are deliberately suppressed for all objects: an S3 presigned GET would
 * hand ciphertext straight to the browser. Callers already fall back to app-streamed {@link #load}
 * when no URL is offered.
 */
@Slf4j
public class EncryptingStorageProvider implements StorageProvider {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StorageProvider delegate;
    private final FileEncryptionKeyService keys;
    private final boolean writeEnabled;

    public EncryptingStorageProvider(
            StorageProvider delegate, FileEncryptionKeyService keys, boolean writeEnabled) {
        this.delegate = delegate;
        this.keys = keys;
        this.writeEnabled = writeEnabled;
    }

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        if (!writeEnabled) {
            return delegate.store(owner, file);
        }
        FileEncryptionKeyService.ScopeKek kek = keys.activeKekForOwner(owner);
        byte[] dek = new byte[EncryptedFileFormat.DEK_LENGTH_BYTES];
        RANDOM.nextBytes(dek);

        // Spool ciphertext to a temp file: DatabaseStorageProvider needs getBytes() and
        // S3StorageProvider needs an exact Content-Length, so the ciphertext size must be known
        // before the delegate reads the upload.
        Path spool = Files.createTempFile("stirling-enc-", ".bin");
        try {
            EncryptedFileFormat.Header header = buildHeader(kek, dek, file.getSize());
            byte[] aad = header.associatedData();
            try (OutputStream out = new BufferedOutputStream(Files.newOutputStream(spool))) {
                out.write(header.serialize());
                OutputStream encrypting = streamingAead(dek).newEncryptingStream(out, aad);
                try (InputStream in = file.getInputStream()) {
                    in.transferTo(encrypting);
                }
                encrypting.close();
            } catch (GeneralSecurityException e) {
                throw new StorageEncryptionException("Failed to encrypt upload", e);
            }
            StoredObject stored = delegate.store(owner, new SpooledUpload(file, spool));
            log.debug(
                    "Encrypted {} under key {} ({} plaintext bytes)",
                    stored.getStorageKey(),
                    kek.keyId(),
                    file.getSize());
            return stored.toBuilder()
                    .sizeBytes(file.getSize())
                    .encryptionKeyId(kek.keyId().toString())
                    .build();
        } finally {
            Arrays.fill(dek, (byte) 0);
            Files.deleteIfExists(spool);
        }
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        Resource raw = delegate.load(storageKey);
        if (raw.isOpen()) {
            return wrapOneShot(raw);
        }
        return wrapReopenable(raw);
    }

    @Override
    public void delete(String storageKey) throws IOException {
        delegate.delete(storageKey);
    }

    @Override
    public void close() {
        try {
            delegate.close();
        } catch (Exception e) {
            log.warn("Error closing delegate storage provider", e);
        }
    }

    @Override
    public Optional<URI> signedDownloadUrl(String storageKey, Duration ttl) {
        return Optional.empty();
    }

    @Override
    public Optional<URI> signedDownloadUrl(
            String storageKey, Duration ttl, boolean inline, String originalFilename) {
        return Optional.empty();
    }

    // ---- store helpers -------------------------------------------------------------------

    private EncryptedFileFormat.Header buildHeader(
            FileEncryptionKeyService.ScopeKek kek, byte[] dek, long plaintextLength)
            throws StorageEncryptionException {
        // AAD covers the header prefix, so build a header with a placeholder wrap first to get
        // the prefix bytes, then wrap the DEK bound to that prefix.
        EncryptedFileFormat.Header prototype =
                new EncryptedFileFormat.Header(
                        EncryptedFileFormat.FORMAT_VERSION,
                        EncryptedFileFormat.SUITE_AES_GCM_HKDF_1MIB,
                        kek.keyId(),
                        plaintextLength,
                        new byte[EncryptedFileFormat.WRAPPED_DEK_LENGTH]);
        byte[] aad = prototype.associatedData();
        byte[] wrappedDek = wrapDek(dek, kek.key(), aad);
        return new EncryptedFileFormat.Header(
                EncryptedFileFormat.FORMAT_VERSION,
                EncryptedFileFormat.SUITE_AES_GCM_HKDF_1MIB,
                kek.keyId(),
                plaintextLength,
                wrappedDek);
    }

    private static byte[] wrapDek(byte[] dek, byte[] kek, byte[] aad)
            throws StorageEncryptionException {
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            javax.crypto.Cipher cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    javax.crypto.Cipher.ENCRYPT_MODE,
                    new javax.crypto.spec.SecretKeySpec(kek, "AES"),
                    new javax.crypto.spec.GCMParameterSpec(128, iv));
            cipher.updateAAD(aad);
            byte[] ct = cipher.doFinal(dek);
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return out;
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException("Failed to wrap file key", e);
        }
    }

    private byte[] unwrapDek(EncryptedFileFormat.Header header) throws IOException {
        byte[] kek = keys.kekForDecrypt(header.keyId());
        try {
            byte[] wrapped = header.wrappedDek();
            byte[] iv = Arrays.copyOfRange(wrapped, 0, 12);
            byte[] ct = Arrays.copyOfRange(wrapped, 12, wrapped.length);
            javax.crypto.Cipher cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    javax.crypto.Cipher.DECRYPT_MODE,
                    new javax.crypto.spec.SecretKeySpec(kek, "AES"),
                    new javax.crypto.spec.GCMParameterSpec(128, iv));
            cipher.updateAAD(header.associatedData());
            return cipher.doFinal(ct);
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException(
                    "Failed to unwrap file key for key " + header.keyId() + " — tampered header?",
                    e);
        }
    }

    private static AesGcmHkdfStreaming streamingAead(byte[] dek) throws GeneralSecurityException {
        return new AesGcmHkdfStreaming(
                dek,
                "HMACSHA256",
                EncryptedFileFormat.DEK_LENGTH_BYTES,
                EncryptedFileFormat.SEGMENT_SIZE_BYTES,
                0);
    }

    // ---- load helpers --------------------------------------------------------------------

    /** Re-openable delegate (local file, DB byte array): sniff via a throwaway stream. */
    private Resource wrapReopenable(Resource raw) throws IOException {
        byte[] prefix;
        try (InputStream in = raw.getInputStream()) {
            prefix = in.readNBytes(EncryptedFileFormat.HEADER_LENGTH);
        }
        EncryptedFileFormat.Header header = EncryptedFileFormat.parse(prefix);
        if (header == null) {
            return raw;
        }
        byte[] dek = unwrapDek(header);
        return new ReopenableDecryptedResource(raw, header, dek);
    }

    /** One-shot delegate (S3 stream): the sniffed prefix must be replayed or decrypted inline. */
    private Resource wrapOneShot(Resource raw) throws IOException {
        InputStream in = raw.getInputStream();
        byte[] prefix = in.readNBytes(EncryptedFileFormat.HEADER_LENGTH);
        EncryptedFileFormat.Header header = EncryptedFileFormat.parse(prefix);
        if (header == null) {
            long length;
            try {
                length = raw.contentLength();
            } catch (IOException | RuntimeException e) {
                // Stock InputStreamResource refuses contentLength() once the stream is
                // partially read; S3's resource reports it from the response header instead.
                length = -1;
            }
            return new OneShotResource(
                    new SequenceInputStream(new ByteArrayInputStream(prefix), in),
                    length,
                    raw.getDescription());
        }
        byte[] dek = unwrapDek(header);
        try {
            InputStream decrypting =
                    streamingAead(dek).newDecryptingStream(in, header.associatedData());
            return new OneShotResource(decrypting, header.plaintextLength(), raw.getDescription());
        } catch (GeneralSecurityException e) {
            throw new StorageEncryptionException("Failed to open decrypting stream", e);
        }
    }

    /** Fresh decrypting stream per read; supports repeated reads and range-skip consumers. */
    private static final class ReopenableDecryptedResource extends AbstractResource {
        private final Resource ciphertext;
        private final EncryptedFileFormat.Header header;
        private final byte[] dek;

        private ReopenableDecryptedResource(
                Resource ciphertext, EncryptedFileFormat.Header header, byte[] dek) {
            this.ciphertext = ciphertext;
            this.header = header;
            this.dek = dek;
        }

        @Override
        public InputStream getInputStream() throws IOException {
            InputStream in = ciphertext.getInputStream();
            try {
                in.skipNBytes(EncryptedFileFormat.HEADER_LENGTH);
                return streamingAead(dek).newDecryptingStream(in, header.associatedData());
            } catch (GeneralSecurityException | IOException e) {
                in.close();
                throw e instanceof IOException io
                        ? io
                        : new StorageEncryptionException("Failed to open decrypting stream", e);
            }
        }

        @Override
        public long contentLength() {
            return header.plaintextLength();
        }

        @Override
        public boolean exists() {
            return ciphertext.exists();
        }

        @Override
        public String getFilename() {
            return ciphertext.getFilename();
        }

        @Override
        public String getDescription() {
            return "decrypted " + ciphertext.getDescription();
        }
    }

    /** Single-use resource over an already-open stream (mirrors InputStreamResource semantics). */
    private static final class OneShotResource extends AbstractResource {
        private final InputStream stream;
        private final long contentLength;
        private final String description;
        private boolean consumed;

        private OneShotResource(InputStream stream, long contentLength, String description) {
            this.stream = stream;
            this.contentLength = contentLength;
            this.description = description;
        }

        @Override
        public synchronized InputStream getInputStream() {
            if (consumed) {
                throw new IllegalStateException(
                        "InputStream has already been read - do not use OneShotResource twice");
            }
            consumed = true;
            return stream;
        }

        @Override
        public long contentLength() {
            return contentLength;
        }

        @Override
        public boolean isOpen() {
            return true;
        }

        @Override
        public boolean exists() {
            return true;
        }

        @Override
        public String getDescription() {
            return "decrypted " + description;
        }
    }

    /** Presents the spooled ciphertext file as the upload the delegate should persist. */
    private static final class SpooledUpload implements MultipartFile {
        private final MultipartFile original;
        private final Path spool;

        private SpooledUpload(MultipartFile original, Path spool) {
            this.original = original;
            this.spool = spool;
        }

        @Override
        public String getName() {
            return original.getName();
        }

        @Override
        public String getOriginalFilename() {
            return original.getOriginalFilename();
        }

        @Override
        public String getContentType() {
            return original.getContentType();
        }

        @Override
        public boolean isEmpty() {
            return getSize() == 0;
        }

        @Override
        public long getSize() {
            try {
                return Files.size(spool);
            } catch (IOException e) {
                throw new IllegalStateException("Spooled ciphertext unavailable", e);
            }
        }

        @Override
        public byte[] getBytes() throws IOException {
            return Files.readAllBytes(spool);
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return Files.newInputStream(spool);
        }

        @Override
        public void transferTo(File dest) throws IOException {
            Files.copy(spool, dest.toPath());
        }
    }
}
