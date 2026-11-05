package stirling.software.saas.payg.cancellation;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import lombok.extern.slf4j.Slf4j;

/**
 * Posts to the customer churn Slack channel, the same incoming webhook the Stripe notifier uses for
 * cancellations, so a "talk to us first" request and its outcome read together.
 */
@Slf4j
@Component
@Profile("saas")
public class ChurnAlertPoster {

    private final RestTemplate restTemplate;
    private final String webhookUrl;

    public ChurnAlertPoster(
            RestTemplate restTemplate,
            @Value("${SLACK_CUSTOMER_CHURN_WEBHOOK_URL:}") String webhookUrl) {
        this.restTemplate = restTemplate;
        this.webhookUrl = webhookUrl;
    }

    /** False when the channel is not configured or Slack refused the post. */
    public boolean post(String text) {
        if (webhookUrl == null || webhookUrl.isBlank()) {
            log.warn("SLACK_CUSTOMER_CHURN_WEBHOOK_URL is not set; churn alert dropped");
            return false;
        }
        try {
            restTemplate.postForEntity(webhookUrl, Map.of("text", text), String.class);
            return true;
        } catch (RestClientException e) {
            log.warn("Churn alert not posted: {}", e.getMessage());
            return false;
        }
    }

    /** Customer text cannot ping a channel or forge a link: Slack only reads unescaped <...>. */
    public static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
