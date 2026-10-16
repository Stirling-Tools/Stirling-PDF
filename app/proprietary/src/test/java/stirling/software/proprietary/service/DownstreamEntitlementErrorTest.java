package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

class DownstreamEntitlementErrorTest {

    @Test
    void carriesTheLocalExhaustionReasonThroughServerSideRuns() {
        assertEquals(
                "FREE_TIER_EXHAUSTED",
                code(
                        HttpStatus.PAYMENT_REQUIRED,
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\"FREE_TIER_EXHAUSTED\"}"));
    }

    @Test
    void doesNotOfferLinkingForOtherAccountOrHttpFailures() {
        assertEquals(
                "ACCOUNT_LINK_REQUIRED",
                code(
                        HttpStatus.PAYMENT_REQUIRED,
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\"OVER_LIMIT\"}"));
        assertNull(
                code(
                        HttpStatus.FORBIDDEN,
                        "{\"error\":\"ACCOUNT_LINK_REQUIRED\",\"reason\":\"FREE_TIER_EXHAUSTED\"}"));
        assertEquals(
                "PAYG_LIMIT_REACHED",
                code(
                        HttpStatus.PAYMENT_REQUIRED,
                        "{\"error\":\"PAYG_LIMIT_REACHED\",\"subscribed\":true}"));
    }

    private static String code(HttpStatus status, String body) {
        return DownstreamEntitlementError.extractCode(
                HttpClientErrorException.create(
                        status,
                        "Blocked",
                        new HttpHeaders(),
                        body.getBytes(StandardCharsets.UTF_8),
                        StandardCharsets.UTF_8));
    }
}
