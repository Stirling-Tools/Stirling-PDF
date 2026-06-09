package stirling.software.saas.payg.meter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.ConnectException;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.saas.payg.model.BillingCategory;

/**
 * Covers the contract documented on {@link PaygMeterReportingService#recordUsage}: never throws,
 * skips when endpoint is blank, counts non-2xx and exceptions on {@code payg.meter.errors}.
 */
class PaygMeterReportingServiceTest {

    private static final String ENDPOINT =
            "https://example.supabase.co/functions/v1/meter-payg-units";
    private static final String TOKEN = "test-service-role-token";

    private RestTemplate restTemplate;
    private MeterRegistry meterRegistry;
    private Counter errorsCounter;

    @BeforeEach
    void setUp() {
        restTemplate = Mockito.mock(RestTemplate.class);
        meterRegistry = new SimpleMeterRegistry();
        errorsCounter = meterRegistry.counter("payg.meter.errors");
    }

    private PaygMeterReportingService newService(String endpoint, String token) {
        return new PaygMeterReportingService(endpoint, token, restTemplate, meterRegistry);
    }

    @Test
    void recordUsage_happyPath_postsBodyAndDoesNotIncrementErrorCounter() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{\"ok\":true}", HttpStatus.OK));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job1:close");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entityCaptor =
                ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate)
                .exchange(
                        eq(ENDPOINT),
                        eq(HttpMethod.POST),
                        entityCaptor.capture(),
                        eq(String.class));

        HttpEntity<Map<String, Object>> sent = entityCaptor.getValue();
        Map<String, Object> body = sent.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("team_id")).isEqualTo("100");
        assertThat(body.get("stripe_customer_id")).isEqualTo("cus_abc");
        assertThat(body.get("units")).isEqualTo(5);
        assertThat(body.get("idempotency_key")).isEqualTo("process:job1:close");
        assertThat(body.get("metadata")).isEqualTo(Map.of("category", "API"));

        HttpHeaders headers = sent.getHeaders();
        assertThat(headers.getFirst("Authorization")).isEqualTo("Bearer " + TOKEN);
        assertThat(headers.getContentType()).isNotNull();
        assertThat(headers.getContentType().toString()).startsWith("application/json");

        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_5xxResponse_incrementsErrorCounterAndDoesNotThrow() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("oops", HttpStatus.INTERNAL_SERVER_ERROR));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        assertThatCode(
                        () ->
                                service.recordUsage(
                                        100L,
                                        "cus_abc",
                                        3,
                                        BillingCategory.AUTOMATION,
                                        "process:job2:close"))
                .doesNotThrowAnyException();

        assertThat(errorsCounter.count()).isEqualTo(1.0);
    }

    @Test
    void recordUsage_connectionRefused_incrementsErrorCounterAndDoesNotThrow() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenThrow(new ResourceAccessException("connect refused", new ConnectException()));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        assertThatCode(
                        () ->
                                service.recordUsage(
                                        100L,
                                        "cus_abc",
                                        7,
                                        BillingCategory.AI,
                                        "process:job3:close"))
                .doesNotThrowAnyException();

        assertThat(errorsCounter.count()).isEqualTo(1.0);
    }

    @Test
    void recordUsage_runtimeException_swallowed() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenThrow(new RuntimeException("boom"));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        assertThatCode(
                        () ->
                                service.recordUsage(
                                        100L,
                                        "cus_abc",
                                        7,
                                        BillingCategory.AI,
                                        "process:job4:close"))
                .doesNotThrowAnyException();

        assertThat(errorsCounter.count()).isEqualTo(1.0);
    }

    @Test
    void recordUsage_blankEndpoint_noopsAndDoesNotCallRestTemplate() {
        PaygMeterReportingService service = newService("", TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job5:close");

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_nullEndpoint_noopsAndDoesNotCallRestTemplate() {
        PaygMeterReportingService service = newService(null, TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job6:close");

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_zeroUnits_noopsAndDoesNotCallRestTemplate() {
        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        service.recordUsage(100L, "cus_abc", 0, BillingCategory.API, "process:job7:close");

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_blankServiceRoleToken_postsWithoutAuthorizationHeader() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{}", HttpStatus.OK));

        PaygMeterReportingService service = newService(ENDPOINT, "");
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job8:close");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> entityCaptor =
                ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate, times(1))
                .exchange(
                        eq(ENDPOINT),
                        eq(HttpMethod.POST),
                        entityCaptor.capture(),
                        eq(String.class));
        assertThat(entityCaptor.getValue().getHeaders().getFirst("Authorization")).isNull();
    }
}
