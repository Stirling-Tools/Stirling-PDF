package stirling.software.proprietary.workflow.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.security.service.EmailService;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.notification.SigningEmailTemplates.Email;
import stirling.software.proprietary.workflow.notification.SigningEmailTemplates.Summary;

class SigningEmailTemplatesTest {

    private static final String LINK = "https://pdf.example.com/shared-sign";

    private static Summary summary(int participants, int signed, int declined, String... awaiting) {
        return new Summary(
                "Contract.pdf",
                "owner@example.com",
                null,
                null,
                participants,
                signed,
                declined,
                List.of(awaiting));
    }

    @Nested
    class Invitation {

        @Test
        void carriesTheBrandLockupAndABrandColouredCta() {
            String html =
                    SigningEmailTemplates.invitation(
                                    "bob@example.com", summary(1, 0, 0, "Bob"), LINK, false)
                            .html();

            assertThat(html)
                    .contains("src=\"cid:" + EmailService.BRAND_LOGO_CONTENT_ID + "\"")
                    .contains("alt=\"Stirling\"")
                    .contains("background-color:#af3434")
                    .doesNotContain("#007bff");
        }

        @Test
        void namesTheRequesterAndDocumentAndLinksToSigning() {
            Email email =
                    SigningEmailTemplates.invitation(
                            "bob@example.com", summary(2, 0, 0, "Bob", "Carol"), LINK, false);

            assertThat(email.to()).isEqualTo("bob@example.com");
            assertThat(email.subject())
                    .isEqualTo("owner@example.com requested your signature on \"Contract.pdf\"");
            assertThat(email.html())
                    .contains("owner@example.com has asked you to sign")
                    .contains("<strong>Contract.pdf</strong>")
                    .contains("href=\"" + LINK + "\"")
                    .contains("Review and sign")
                    .doesNotContain("do not forward");
        }

        @Test
        void guestLinkWarnsThatItActsAsTheParticipant() {
            Email email =
                    SigningEmailTemplates.invitation(
                            "guest@example.com",
                            summary(1, 0, 0, "guest@example.com"),
                            "https://pdf.example.com/workflow/sign/token-1",
                            true);

            assertThat(email.html())
                    .contains("href=\"https://pdf.example.com/workflow/sign/token-1\"")
                    .contains("do not forward this email");
        }

        @Test
        void includesTheOwnersMessageAndDueDate() {
            Summary summary =
                    new Summary(
                            "Contract.pdf",
                            "owner@example.com",
                            "Please sign\nby Friday",
                            "2026-10-15",
                            1,
                            0,
                            0,
                            List.of("Bob"));

            String html =
                    SigningEmailTemplates.invitation("bob@example.com", summary, LINK, false)
                            .html();

            assertThat(html)
                    .contains("Message from owner@example.com:")
                    .contains("Please sign<br>by Friday")
                    .contains("Please sign by 2026-10-15.");
        }

        @Test
        void withoutALinkTellsTheParticipantWhereToFindIt() {
            String html =
                    SigningEmailTemplates.invitation(
                                    "bob@example.com", summary(1, 0, 0, "Bob"), null, false)
                            .html();

            assertThat(html).contains("open Shared Signing to review it").doesNotContain("<a href");
        }
    }

    @Nested
    class Response {

        @Test
        void signatureWithOthersOutstandingReportsWhoIsLeft() {
            Email email =
                    SigningEmailTemplates.response(
                            "owner@example.com",
                            summary(3, 1, 0, "Bob", "Carol"),
                            "Alice",
                            true,
                            null,
                            LINK);

            assertThat(email.subject()).isEqualTo("Alice signed \"Contract.pdf\"");
            assertThat(email.html())
                    .contains("New signature")
                    .contains("Alice signed <strong>Contract.pdf</strong>.")
                    .contains("Signed: 1 of 3")
                    .contains("Awaiting: 2 (Bob, Carol)")
                    .contains("You can finalize now, but anyone who has not signed yet")
                    .contains("Open Shared Signing")
                    .doesNotContain("Declined:");
        }

        @Test
        void lastSignatureMarksTheDocumentReady() {
            Email email =
                    SigningEmailTemplates.response(
                            "owner@example.com", summary(2, 2, 0), "Alice", true, null, LINK);

            assertThat(email.subject()).isEqualTo("\"Contract.pdf\" is ready to finalize");
            assertThat(email.html())
                    .contains("Ready to finalize")
                    .contains("Signed: 2 of 2")
                    .contains("Everyone has responded, so the document is ready to finalize.")
                    .contains("Review and finalize")
                    .doesNotContain("Awaiting:");
        }

        @Test
        void lastResponseBeingADeclineStillMarksTheDocumentReady() {
            Email email =
                    SigningEmailTemplates.response(
                            "owner@example.com", summary(2, 1, 1), "Bob", false, null, LINK);

            assertThat(email.subject()).isEqualTo("\"Contract.pdf\" is ready to finalize");
            assertThat(email.html())
                    .contains("Bob declined to sign <strong>Contract.pdf</strong>.")
                    .contains("Declined: 1")
                    .contains("ready to finalize");
        }

        @Test
        void declineShowsTheParticipantsReason() {
            Email email =
                    SigningEmailTemplates.response(
                            "owner@example.com",
                            summary(3, 0, 1, "Carol", "Dan"),
                            "Bob",
                            false,
                            "Wrong entity name",
                            LINK);

            assertThat(email.subject()).isEqualTo("Bob declined to sign \"Contract.pdf\"");
            assertThat(email.html())
                    .contains("Signature declined")
                    .contains("Their reason:")
                    .contains("Wrong entity name")
                    .contains("The document can be finalized once someone signs.");
        }

        @Test
        void everyoneDecliningLeavesNothingToFinalize() {
            String html =
                    SigningEmailTemplates.response(
                                    "owner@example.com", summary(1, 0, 1), "Bob", false, null, LINK)
                            .html();

            assertThat(html)
                    .contains("Everyone declined, so there is nothing to finalize.")
                    .doesNotContain("Their reason:");
        }

        @Test
        void longAwaitingListsAreShortened() {
            String[] names =
                    IntStream.rangeClosed(1, 12).mapToObj(i -> "P" + i).toArray(String[]::new);

            String html =
                    SigningEmailTemplates.response(
                                    "owner@example.com",
                                    summary(13, 1, 0, names),
                                    "Alice",
                                    true,
                                    null,
                                    LINK)
                            .html();

            assertThat(html).contains("Awaiting: 12 (P1, P2").contains("P10 and 2 more)");
            assertThat(html).doesNotContain("P11");
        }
    }

    @Nested
    class Completion {

        @Test
        void signerIsToldTheirSignatureIsIncluded() {
            Email email =
                    SigningEmailTemplates.completion(
                            "bob@example.com",
                            summary(3, 2, 1),
                            ParticipantStatus.SIGNED,
                            LINK,
                            false);

            assertThat(email.subject()).isEqualTo("\"Contract.pdf\" has been finalized");
            assertThat(email.html())
                    .contains("owner@example.com finalized <strong>Contract.pdf</strong>.")
                    .contains("Signatures included: 2 of 3")
                    .contains("Your signature is included.")
                    .contains("View signed document");
        }

        @Test
        void decliningParticipantIsToldTheirSignatureIsNotIncluded() {
            String html =
                    SigningEmailTemplates.completion(
                                    "bob@example.com",
                                    summary(2, 1, 1),
                                    ParticipantStatus.DECLINED,
                                    LINK,
                                    false)
                            .html();

            assertThat(html).contains("You declined this request");
        }

        @Test
        void participantWhoNeverRespondedIsToldTheRequestClosed() {
            String html =
                    SigningEmailTemplates.completion(
                                    "bob@example.com",
                                    summary(2, 1, 0, "Bob"),
                                    ParticipantStatus.VIEWED,
                                    null,
                                    false)
                            .html();

            assertThat(html)
                    .contains("The request closed before you signed")
                    .contains("open Shared Signing to download the signed document");
        }

        @Test
        void guestLinkWarnsThatItOpensTheSignedDocument() {
            String html =
                    SigningEmailTemplates.completion(
                                    "guest@example.com",
                                    summary(2, 2, 0),
                                    ParticipantStatus.SIGNED,
                                    "https://pdf.example.com/workflow/sign/token-1",
                                    true)
                            .html();

            assertThat(html)
                    .contains("href=\"https://pdf.example.com/workflow/sign/token-1\"")
                    .contains("opens the signed document for anyone who has it");
        }
    }

    @Nested
    class UntrustedInput {

        @Test
        void bodyEscapesHtmlFromUsers() {
            Summary summary =
                    new Summary(
                            "<img src=x onerror=alert(1)>.pdf",
                            "a&b <owner>",
                            "<script>steal()</script>",
                            null,
                            1,
                            0,
                            0,
                            List.of("<b>Bob</b>"));

            String html =
                    SigningEmailTemplates.invitation("bob@example.com", summary, LINK, false)
                            .html();

            assertThat(html)
                    .doesNotContain("<img src=x")
                    .doesNotContain("<script>")
                    .doesNotContain("<owner>")
                    .contains("&lt;img src=x onerror=alert(1)&gt;.pdf")
                    .contains("a&amp;b &lt;owner&gt;")
                    .contains("&lt;script&gt;steal()&lt;/script&gt;");
        }

        @Test
        void subjectCannotCarryAHeaderBreak() {
            Summary summary =
                    new Summary(
                            "Contract.pdf\r\nBcc: victim@example.com",
                            "owner\n@example.com",
                            null,
                            null,
                            1,
                            0,
                            0,
                            List.of("Bob"));

            String subject =
                    SigningEmailTemplates.invitation("bob@example.com", summary, LINK, false)
                            .subject();

            assertThat(subject).doesNotContain("\r").doesNotContain("\n");
            assertThat(subject)
                    .isEqualTo(
                            "owner @example.com requested your signature on \"Contract.pdf Bcc:"
                                    + " victim@example.com\"");
        }

        @Test
        void longDocumentNamesAreTruncatedInTheSubject() {
            String longName = "A".repeat(200) + ".pdf";
            Summary summary = new Summary(longName, "owner", null, null, 1, 1, 0, List.of());

            String subject =
                    SigningEmailTemplates.completion(
                                    "bob@example.com",
                                    summary,
                                    ParticipantStatus.SIGNED,
                                    LINK,
                                    false)
                            .subject();

            assertThat(subject).isEqualTo("\"" + "A".repeat(77) + "...\" has been finalized");
        }
    }
}
