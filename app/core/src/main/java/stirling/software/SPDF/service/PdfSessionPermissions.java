package stirling.software.SPDF.service;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.SecurityHandler;
import org.apache.pdfbox.pdmodel.encryption.StandardSecurityHandler;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Permission decisions for original documents loaded read-only by the interactive workflow. */
public final class PdfSessionPermissions {
    private PdfSessionPermissions() {}

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
        boolean assemble =
                document.isEncrypted() && document.getEncryption().getRevision() == 2
                        ? permission.canModify()
                        : permission.canAssembleDocument();
        boolean permitted =
                switch (endpoint) {
                    case "/api/v1/general/rotate-pdf",
                            "/api/v1/general/remove-pages",
                            "/api/v1/general/rearrange-pages",
                            "/api/v1/general/merge-pdfs" ->
                            assemble;
                    case "/api/v1/general/split-pages",
                            "/api/v1/general/split-pdf-by-sections",
                            "/api/v1/general/split-by-size-or-count",
                            "/api/v1/general/split-pdf-by-chapters",
                            "/api/v1/general/split-for-poster-print",
                            "/api/v1/misc/auto-split-pdf",
                            "/api/v1/misc/auto-rename" ->
                            permission.canExtractContent();
                    case "/api/v1/misc/compress-pdf",
                            "/api/v1/security/add-watermark",
                            "/api/v1/misc/add-stamp",
                            "/api/v1/misc/add-page-numbers",
                            "/api/v1/general/scale-pages",
                            "/api/v1/general/crop",
                            "/api/v1/misc/replace-invert-pdf",
                            "/api/v1/general/remove-image-pdf",
                            "/api/v1/security/auto-redact",
                            "/api/v1/misc/ocr-pdf",
                            "/api/v1/misc/repair" ->
                            permission.canModify();
                    case "/api/v1/misc/flatten",
                            "/api/v1/security/sanitize-pdf",
                            "/api/v1/misc/unlock-pdf-forms" ->
                            permission.canModify() && permission.canModifyAnnotations();
                    case "/api/v1/general/booklet-imposition",
                            "/api/v1/general/pdf-to-single-page" ->
                            permission.canModify() && assemble;
                    case "/api/v1/general/multi-page-layout" ->
                            permission.canModify() && assemble && permission.canModifyAnnotations();
                    case "/api/v1/misc/remove-blanks" -> assemble && permission.canExtractContent();
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
