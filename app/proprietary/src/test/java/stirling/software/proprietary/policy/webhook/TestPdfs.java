package stirling.software.proprietary.policy.webhook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;

final class TestPdfs {

    private TestPdfs() {}

    static byte[] minimal() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            return bytes(document);
        }
    }

    /** Opens only with the user password, which is the case no pipeline can get past. */
    static byte[] userPasswordProtected() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            StandardProtectionPolicy policy =
                    new StandardProtectionPolicy("owner-pw", "user-pw", new AccessPermission());
            policy.setEncryptionKeyLength(128);
            document.protect(policy);
            return bytes(document);
        }
    }

    private static byte[] bytes(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }
}
