package stirling.software.SPDF.service;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.encryption.StandardDecryptionMaterial;
import org.apache.pdfbox.pdmodel.encryption.StandardSecurityHandler;

/** Identifies password roles without changing the loaded document's authentication. */
public final class PdfPasswordRoles {
    private PdfPasswordRoles() {}

    /** Tests the opening credential independently, including when both passwords are identical. */
    public static boolean isOpeningPassword(PDDocument document, String password)
            throws IOException {
        if (!document.isEncrypted()) return false;
        var encryption =
                new PDEncryption(new COSDictionary(document.getEncryption().getCOSObject()));
        if (encryption.getRevision() < 5) {
            var ids = document.getDocument().getDocumentID();
            byte[] id = ids == null ? new byte[0] : ((COSString) ids.getObject(0)).getBytes();
            return new StandardSecurityHandler()
                    .isUserPassword(
                            password,
                            encryption.getUserKey(),
                            encryption.getOwnerKey(),
                            encryption.getPermissions(),
                            id,
                            encryption.getRevision(),
                            encryption.getLength() / 8,
                            encryption.isEncryptMetaData());
        }
        // PDFBox tries the owner first. Mask only that entry in an isolated dictionary so its
        // normal password encoding, normalization and user authentication remain authoritative.
        encryption.setOwnerKey(new byte[encryption.getOwnerKey().length]);
        try {
            new StandardSecurityHandler()
                    .prepareForDecryption(
                            encryption,
                            document.getDocument().getDocumentID(),
                            new StandardDecryptionMaterial(password));
            return true;
        } catch (InvalidPasswordException incorrect) {
            return false;
        }
    }

    /** An opening-only PDF may use the same credential for both PDF security roles. */
    public static boolean hasSeparateOwnerPassword(PDDocument document, String password)
            throws IOException {
        return document.isEncrypted()
                && !(PdfSessionPermissions.isOwnerAuthenticated(document)
                        && isOpeningPassword(document, password));
    }
}
