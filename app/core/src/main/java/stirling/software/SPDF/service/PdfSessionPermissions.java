package stirling.software.SPDF.service;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.SecurityHandler;
import org.apache.pdfbox.pdmodel.encryption.StandardSecurityHandler;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Permission decisions for original documents loaded read-only by the interactive workflow. */
public final class PdfSessionPermissions {
    private PdfSessionPermissions() {}

    /** Identifies the stored credential entries without returning them or either password. */
    public static String credentialFingerprint(PDDocument document) throws IOException {
        if (!document.isEncrypted()) return "";
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            var encryption = document.getEncryption().getCOSObject();
            for (var key : new COSName[] {COSName.O, COSName.U, COSName.OE, COSName.UE}) {
                if (encryption.getDictionaryObject(key) instanceof COSString value) {
                    byte[] bytes = value.getBytes();
                    digest.update((byte) bytes.length);
                    digest.update(bytes);
                } else digest.update((byte) 0);
            }
            var ids = document.getDocument().getDocumentID();
            if (ids != null && ids.size() > 0 && ids.getObject(0) instanceof COSString id) {
                digest.update(id.getBytes());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("PDF credential verification is unavailable", e);
        }
    }

    /** Requires a freshly loaded document whose access permission has not been mutated. */
    public static boolean isOwnerAuthenticated(PDDocument document) throws IOException {
        if (!document.isEncrypted()) return false;
        SecurityHandler<?> handler = document.getEncryption().getSecurityHandler();
        if (!(handler instanceof StandardSecurityHandler)) {
            throw new IOException("Only password-based PDF protection is supported");
        }
        // PDFBox marks user-authenticated permissions read-only, even when every bit is allowed.
        // The owner-authenticated branch returns mutable permissions; permission bits alone cannot
        // identify which credential matched (StandardSecurityHandler.prepareForDecryption).
        return !document.getCurrentAccessPermission().isReadOnly();
    }

    /**
     * Rejects unsupported operations and restrictions before temporary decrypted bytes are created.
     */
    public static void requireOperation(
            PDDocument document, String endpoint, boolean honorOwnerPasswords) throws IOException {
        var permission = document.getCurrentAccessPermission();
        boolean permitted =
                switch (endpoint) {
                    case "/api/v1/general/rotate-pdf",
                            "/api/v1/general/remove-pages",
                            "/api/v1/general/rearrange-pages",
                            "/api/v1/general/merge-pdfs" ->
                            document.isEncrypted() && document.getEncryption().getRevision() == 2
                                    ? permission.canModify()
                                    : permission.canAssembleDocument();
                    case "/api/v1/general/split-pages",
                            "/api/v1/general/split-pdf-by-sections",
                            "/api/v1/general/split-by-size-or-count",
                            "/api/v1/general/split-pdf-by-chapters",
                            "/api/v1/general/split-for-poster-print",
                            "/api/v1/misc/auto-split-pdf" ->
                            permission.canExtractContent();
                    case "/api/v1/misc/compress-pdf" -> permission.canModify();
                    default ->
                            throw new ResponseStatusException(
                                    HttpStatus.BAD_REQUEST,
                                    "This operation cannot preserve PDF protection");
                };
        if (!document.isEncrypted()) return;
        if (!document.getSignatureDictionaries().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Signed protected PDFs support viewing only");
        }
        if (honorOwnerPasswords && !isOwnerAuthenticated(document) && !permitted) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "This operation requires the permissions password");
        }
    }

    /**
     * The server policy controls owner authentication; signature-preservation limits always apply.
     */
    public static void requireOwner(PDDocument document, boolean honorOwnerPasswords)
            throws IOException {
        if (honorOwnerPasswords && document.isEncrypted() && !isOwnerAuthenticated(document)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Changing PDF protection requires the permissions password");
        }
        if (!document.getSignatureDictionaries().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Changing protection on signed PDFs is not supported");
        }
    }
}
