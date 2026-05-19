package stirling.software.proprietary.service;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Content-addressable id derived from the SHA-256 hash of the uploaded bytes. Same content always
 * hashes to the same id, so re-uploads dedupe naturally in RAG. Suitable for session and SaaS
 * deployments; a folder-watch deployment would use a different strategy keyed by path.
 */
@Component
public class ByteHashFileIdStrategy implements FileIdStrategy {

    /**
     * Hex-char length of the returned id. 16 chars = 64 bits of collision space, which is plenty
     * for per-user document sets and keeps RAG collection names short.
     */
    private static final int ID_HEX_LENGTH = 16;

    private static final int BUFFER_SIZE = 64 * 1024;

    @Override
    public String idFor(MultipartFile file) throws IOException {
        MessageDigest digest = sha256();
        try (InputStream in = file.getInputStream()) {
            byte[] buffer = new byte[BUFFER_SIZE];
            int read;
            while ((read = in.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder(ID_HEX_LENGTH);
        for (int i = 0; hex.length() < ID_HEX_LENGTH; i++) {
            hex.append(String.format("%02x", hash[i]));
        }
        return hex.toString();
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK; absent only if the platform is broken.
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
