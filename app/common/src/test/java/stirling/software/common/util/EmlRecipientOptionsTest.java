package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.util.EmlParser.EmailContent;

class EmlRecipientOptionsTest {
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void respectsRecipientChoice(boolean includeAllRecipients) {
        var request = new EmlToPdfRequest();
        request.setIncludeAllRecipients(includeAllRecipients);
        String html = EmlProcessingUtils.generateEnhancedEmailHtml(email(), request, null);
        assertThat(html).contains("sender@example.com", "to@example.com", "Email body");
        assertThat(html.contains("cc-only@example.com")).isEqualTo(includeAllRecipients);
        assertThat(html.contains("bcc-only@example.com")).isEqualTo(includeAllRecipients);
    }

    @Test
    void retainsRecipientsWithoutRequestOptions() {
        String html = EmlProcessingUtils.generateEnhancedEmailHtml(email(), null, null);
        assertThat(html).contains("cc-only@example.com", "bcc-only@example.com");
    }

    private static EmailContent email() {
        var content = new EmailContent();
        content.setSubject("Subject");
        content.setFrom("sender@example.com");
        content.setTo("to@example.com");
        content.setCc("cc-only@example.com");
        content.setBcc("bcc-only@example.com");
        content.setTextBody("Email body");
        return content;
    }
}
