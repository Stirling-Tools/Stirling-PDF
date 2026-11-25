package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.webhook.InboundDocumentCheck.Verdict;

class InboundDocumentCheckTest {

    @Test
    void aReadablePdfIsAcceptable() throws IOException {
        assertThat(InboundDocumentCheck.check("doc.pdf", TestPdfs.minimal()))
                .isEqualTo(Verdict.ACCEPTABLE);
    }

    @Test
    void aUserPasswordIsRefused() throws IOException {
        assertThat(InboundDocumentCheck.check("doc.pdf", TestPdfs.userPasswordProtected()))
                .isEqualTo(Verdict.PASSWORD_PROTECTED);
    }

    @Test
    void garbageNamedAsAPdfIsCorrupt() {
        byte[] body = "not really a pdf".getBytes(StandardCharsets.UTF_8);
        assertThat(InboundDocumentCheck.check("scan.PDF", body)).isEqualTo(Verdict.CORRUPT);
    }

    @Test
    void aPdfHeaderIsCheckedWhateverTheFilenameSays() {
        byte[] body = "%PDF-1.7 but nothing follows".getBytes(StandardCharsets.UTF_8);
        assertThat(InboundDocumentCheck.check("photo.jpg", body)).isEqualTo(Verdict.CORRUPT);
    }

    @Test
    void anythingThatDoesNotPresentAsAPdfPassesThrough() {
        // Policies convert other formats; the check has no opinion on them.
        byte[] body = "GIF89a".getBytes(StandardCharsets.UTF_8);
        assertThat(InboundDocumentCheck.check("banner.gif", body)).isEqualTo(Verdict.ACCEPTABLE);
        assertThat(InboundDocumentCheck.check(null, body)).isEqualTo(Verdict.ACCEPTABLE);
    }
}
