package stirling.software.SPDF.service;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.DecryptionMaterial;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.encryption.ProtectionPolicy;
import org.apache.pdfbox.pdmodel.encryption.SecurityHandler;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.encryption.StandardSecurityHandler;

/** Changes permission bits while retaining both credentials and the encryption revision. */
public final class PdfPermissionSecurityHandler extends SecurityHandler<ProtectionPolicy> {
    private PdfPermissionSecurityHandler(PDDocument document, byte[] key) throws IOException {
        var encryption = document.getEncryption();
        var previous = encryption.getSecurityHandler();
        setProtectionPolicy(new StandardProtectionPolicy("", "", new AccessPermission()));
        setEncryptionKey(key);
        setAES(previous.isAES());
        setDecryptMetadata(encryption.isEncryptMetaData());
        setStringFilterName(encryption.getStringFilterName());
        setStreamFilterName(encryption.getStreamFilterName());
    }

    /**
     * Requires an authenticated, unsigned document and a credential that opened its original bytes.
     */
    public static void changePermissions(
            PDDocument document, String password, AccessPermission permissions) throws IOException {
        var encryption = document.getEncryption();
        SecurityHandler<?> original = encryption.getSecurityHandler();
        if (!(original instanceof StandardSecurityHandler handler)) {
            throw new IOException("Only password-based PDF protection is supported");
        }
        byte[] key = handler.getEncryptionKey();
        int revision = encryption.getRevision();
        int permissionBytes = permissions.getPermissionBytes();
        if (revision >= 5 && revision <= 6) {
            try {
                // ISO 32000 algorithm 10 binds P to the existing file key; neither password entry
                // needs to change when only permissions change in AES-256 encryption.
                var cipher = Cipher.getInstance("AES/ECB/NoPadding");
                var secret = new SecretKeySpec(key, "AES");
                cipher.init(Cipher.DECRYPT_MODE, secret);
                byte[] perms = cipher.doFinal(encryption.getPerms());
                ByteBuffer.wrap(perms).order(ByteOrder.LITTLE_ENDIAN).putInt(permissionBytes);
                cipher.init(Cipher.ENCRYPT_MODE, secret);
                encryption.setPerms(cipher.doFinal(perms));
            } catch (GeneralSecurityException e) {
                throw new IOException("Unable to preserve PDF credentials", e);
            }
        } else if (revision >= 2 && revision <= 4) {
            byte[] reader = password.getBytes(StandardCharsets.ISO_8859_1);
            if (PdfSessionPermissions.isOwnerAuthenticated(document)) {
                reader =
                        handler.getUserPassword(
                                reader,
                                encryption.getOwnerKey(),
                                revision,
                                encryption.getLength() / 8);
            }
            byte[] id =
                    ((COSString) document.getDocument().getDocumentID().getObject(0)).getBytes();
            encryption.setUserKey(
                    handler.computeUserPassword(
                            reader,
                            encryption.getOwnerKey(),
                            permissionBytes,
                            id,
                            revision,
                            encryption.getLength() / 8,
                            encryption.isEncryptMetaData()));
            key =
                    handler.computeEncryptedKey(
                            reader,
                            encryption.getOwnerKey(),
                            encryption.getUserKey(),
                            null,
                            null,
                            permissionBytes,
                            id,
                            revision,
                            encryption.getLength() / 8,
                            encryption.isEncryptMetaData(),
                            false);
        } else {
            throw new IOException("Unsupported PDF encryption revision");
        }
        encryption.setPermissions(permissionBytes);
        encryption.setSecurityHandler(new PdfPermissionSecurityHandler(document, key));
    }

    /**
     * The dictionary and file key are already prepared; regenerating them would replace passwords.
     */
    @Override
    public void prepareDocumentForEncryption(PDDocument document) {}

    /** This handler only writes an already authenticated document. */
    @Override
    public void prepareForDecryption(
            PDEncryption encryption, COSArray id, DecryptionMaterial material) throws IOException {
        throw new IOException("Use the standard security handler to authenticate PDFs");
    }
}
