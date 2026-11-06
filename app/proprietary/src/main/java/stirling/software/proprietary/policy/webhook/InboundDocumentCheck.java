package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;

/**
 * What can be known about a delivered document before any pipeline runs on it. Only bodies that
 * present as PDFs are opened: policies accept other formats (a folder source takes any extension),
 * and no step can supply a PDF password, so a document that needs one fails every pipeline it could
 * reach and is better refused while the sender is still on the line.
 */
final class InboundDocumentCheck {

    private static final byte[] PDF_MAGIC = "%PDF".getBytes(StandardCharsets.US_ASCII);

    private InboundDocumentCheck() {}

    enum Verdict {
        ACCEPTABLE,
        /** Opens only with a user password, which nothing downstream has. */
        PASSWORD_PROTECTED,
        /** Presents as a PDF but PDFBox cannot parse it. */
        CORRUPT
    }

    static Verdict check(String filename, byte[] body) {
        if (!presentsAsPdf(filename, body)) {
            return Verdict.ACCEPTABLE;
        }
        try (PDDocument ignored = Loader.loadPDF(body)) {
            return Verdict.ACCEPTABLE;
        } catch (InvalidPasswordException e) {
            return Verdict.PASSWORD_PROTECTED;
        } catch (IOException | RuntimeException e) {
            return Verdict.CORRUPT;
        }
    }

    private static boolean presentsAsPdf(String filename, byte[] body) {
        if (filename != null && filename.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            return true;
        }
        if (body.length < PDF_MAGIC.length) {
            return false;
        }
        for (int i = 0; i < PDF_MAGIC.length; i++) {
            if (body[i] != PDF_MAGIC[i]) {
                return false;
            }
        }
        return true;
    }
}
