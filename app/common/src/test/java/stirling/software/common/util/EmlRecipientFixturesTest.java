package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import stirling.software.common.model.api.converters.EmlToPdfRequest;

class EmlRecipientFixturesTest {

    @ParameterizedTest(name = "{0}: includeAllRecipients={1}")
    @MethodSource("recipientChoices")
    void respectsRecipientChoiceFromEmailFile(String fixture, boolean includeAllRecipients)
            throws IOException {
        var request = new EmlToPdfRequest();
        request.setIncludeAllRecipients(includeAllRecipients);

        String html = convertFixture(fixture, request);

        assertMessageContentPreserved(html);
        if (includeAllRecipients) {
            assertCopyRecipientsPresent(html);
        } else {
            assertThat(html)
                    .doesNotContain(
                            "<strong>CC:</strong>",
                            "<strong>BCC:</strong>",
                            "cc-only@example.com",
                            "cc-second@example.com",
                            "bcc-only@example.com",
                            "René Copy",
                            "Second Copy",
                            "Søren Blind");
        }
    }

    @ParameterizedTest
    @MethodSource("recipientFixtures")
    void includesCopyRecipientsByDefault(String fixture) throws IOException {
        String html = convertFixture(fixture, new EmlToPdfRequest());

        assertMessageContentPreserved(html);
        assertCopyRecipientsPresent(html);
    }

    @ParameterizedTest
    @MethodSource("recipientFixtures")
    void includesCopyRecipientsWithoutRequestOptions(String fixture) throws IOException {
        String html = convertFixture(fixture, null);

        assertMessageContentPreserved(html);
        assertCopyRecipientsPresent(html);
    }

    private static Stream<String> recipientFixtures() {
        return Stream.of("recipients.eml", "recipients-unicode.msg", "recipients-ansi.msg");
    }

    private static Stream<Arguments> recipientChoices() {
        return recipientFixtures()
                .flatMap(
                        fixture ->
                                Stream.of(
                                        Arguments.of(fixture, false), Arguments.of(fixture, true)));
    }

    private static String convertFixture(String fixture, EmlToPdfRequest request)
            throws IOException {
        try (var input =
                EmlRecipientFixturesTest.class.getResourceAsStream("/eml/recipients/" + fixture)) {
            assertThat(input).as("email fixture %s", fixture).isNotNull();
            return EmlToPdf.convertEmlToHtml(input.readAllBytes(), request);
        }
    }

    private static void assertMessageContentPreserved(String html) {
        assertThat(html)
                .contains(
                        "<strong>From:</strong>",
                        "<strong>To:</strong>",
                        "sender@example.com",
                        "to@example.com",
                        "Élodie Sender",
                        "Zoë Primary",
                        "Recipient options café",
                        "Fixture email body with café.");
    }

    private static void assertCopyRecipientsPresent(String html) {
        assertThat(html)
                .contains(
                        "<strong>CC:</strong>",
                        "<strong>BCC:</strong>",
                        "cc-only@example.com",
                        "cc-second@example.com",
                        "bcc-only@example.com",
                        "René Copy",
                        "Second Copy",
                        "Søren Blind");
    }
}
