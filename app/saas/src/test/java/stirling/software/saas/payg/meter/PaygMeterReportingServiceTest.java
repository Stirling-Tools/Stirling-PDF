package stirling.software.saas.payg.meter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.ConnectException;
import java.util.Map;
import java.util.UUID;

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
import stirling.software.saas.payg.repository.PaygMeterEventLogRepository;

/**
 * Covers the contract documented on {@link PaygMeterReportingService#recordUsage}: never throws,
 * skips when endpoint is blank, counts non-2xx and exceptions on {@code payg.meter.errors}, and
 * wraps every POST in a durable {@code payg_meter_event_log} row (pending → posted / failed).
 */
class PaygMeterReportingServiceTest {

    private static final String ENDPOINT =
            "https://example.supabase.co/functions/v1/meter-payg-units";
    private static final String TOKEN = "test-service-role-token";
    private static final UUID JOB = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

    private RestTemplate restTemplate;
    private PaygMeterEventLogRepository eventLogRepository;
    private MeterRegistry meterRegistry;
    private Counter errorsCounter;

    @BeforeEach
    void setUp() {
        restTemplate = Mockito.mock(RestTemplate.class);
        eventLogRepository = Mockito.mock(PaygMeterEventLogRepository.class);
        meterRegistry = new SimpleMeterRegistry();
        errorsCounter = meterRegistry.counter("payg.meter.errors");
    }

    private PaygMeterReportingService newService(String endpoint, String token) {
        return new PaygMeterReportingService(
                endpoint, token, restTemplate, eventLogRepository, meterRegistry);
    }

    @Test
    void recordUsage_happyPath_postsBodyLogsPendingThenPosted() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{\"ok\":true}", HttpStatus.OK));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job1:close", JOB);

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
        // JSON number — the edge fn type-checks team_id and ignores strings.
        assertThat(body.get("team_id")).isEqualTo(100L);
        assertThat(body.get("stripe_customer_id")).isEqualTo("cus_abc");
        assertThat(body.get("units")).isEqualTo(5);
        assertThat(body.get("idempotency_key")).isEqualTo("process:job1:close");
        assertThat(body.get("metadata")).isEqualTo(Map.of("category", "API"));

        HttpHeaders headers = sent.getHeaders();
        assertThat(headers.getFirst("Authorization")).isEqualTo("Bearer " + TOKEN);
        assertThat(headers.getContentType()).isNotNull();
        assertThat(headers.getContentType().toString()).startsWith("application/json");

        // Durable audit: pending row written before the POST, stamped posted after success.
        verify(eventLogRepository).insertPending(100L, JOB, "process:job1:close", 5);
        verify(eventLogRepository).markPosted("process:job1:close");
        verify(eventLogRepository, never()).markFailed(any(), any(), any());
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_5xxResponse_marksFailedIncrementsErrorCounterAndDoesNotThrow() {
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
                                        "process:job2:close",
                                        JOB))
                .doesNotThrowAnyException();

        verify(eventLogRepository).insertPending(100L, JOB, "process:job2:close", 3);
        verify(eventLogRepository).markFailed(eq("process:job2:close"), eq("500"), any());
        verify(eventLogRepository, never()).markPosted(any());
        assertThat(errorsCounter.count()).isEqualTo(1.0);
    }

    @Test
    void recordUsage_connectionRefused_marksFailedIncrementsErrorCounterAndDoesNotThrow() {
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
                                        "process:job3:close",
                                        JOB))
                .doesNotThrowAnyException();

        verify(eventLogRepository).insertPending(100L, JOB, "process:job3:close", 7);
        verify(eventLogRepository).markFailed(eq("process:job3:close"), eq("exception"), any());
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
                                        "process:job4:close",
                                        JOB))
                .doesNotThrowAnyException();

        verify(eventLogRepository).markFailed(eq("process:job4:close"), eq("exception"), any());
        assertThat(errorsCounter.count()).isEqualTo(1.0);
    }

    @Test
    void recordUsage_logPendingFailure_stillPostsAndDoesNotThrow() {
        // A DB hiccup writing the audit row must not stop us metering the customer.
        Mockito.doThrow(new RuntimeException("db down"))
                .when(eventLogRepository)
                .insertPending(any(), any(), any(), anyInt());
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{}", HttpStatus.OK));

        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        assertThatCode(
                        () ->
                                service.recordUsage(
                                        100L,
                                        "cus_abc",
                                        2,
                                        BillingCategory.API,
                                        "process:job9:close",
                                        JOB))
                .doesNotThrowAnyException();

        verify(restTemplate).exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class));
    }

    @Test
    void recordUsage_blankEndpoint_noopsAndDoesNotCallRestTemplateOrLog() {
        PaygMeterReportingService service = newService("", TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job5:close", JOB);

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        verify(eventLogRepository, never()).insertPending(any(), any(), any(), anyInt());
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_nullEndpoint_noopsAndDoesNotCallRestTemplate() {
        PaygMeterReportingService service = newService(null, TOKEN);
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job6:close", JOB);

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        verify(eventLogRepository, never()).insertPending(any(), any(), any(), anyInt());
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_zeroUnits_noopsAndDoesNotCallRestTemplateOrLog() {
        PaygMeterReportingService service = newService(ENDPOINT, TOKEN);
        service.recordUsage(100L, "cus_abc", 0, BillingCategory.API, "process:job7:close", JOB);

        verify(restTemplate, never()).exchange(any(String.class), any(), any(), any(Class.class));
        verify(eventLogRepository, never()).insertPending(any(), any(), any(), anyInt());
        assertThat(errorsCounter.count()).isZero();
    }

    @Test
    void recordUsage_blankServiceRoleToken_postsWithoutAuthorizationHeader() {
        when(restTemplate.exchange(eq(ENDPOINT), eq(HttpMethod.POST), any(), eq(String.class)))
                .thenReturn(new ResponseEntity<>("{}", HttpStatus.OK));

        PaygMeterReportingService service = newService(ENDPOINT, "");
        service.recordUsage(100L, "cus_abc", 5, BillingCategory.API, "process:job8:close", JOB);

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
