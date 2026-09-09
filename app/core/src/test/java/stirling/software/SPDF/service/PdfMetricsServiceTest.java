package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PostHogService;

class PdfMetricsServiceTest {

    private PostHogService postHogService;
    private ApplicationProperties applicationProperties;
    private PdfMetricsService service;

    @BeforeEach
    void setUp() {
        postHogService = mock(PostHogService.class);
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableAnalytics(true);
        service = new PdfMetricsService(postHogService, applicationProperties);
    }

    @Test
    void flushesOperationAndPdfCounts() {
        service.recordOperation(1);
        service.recordOperation(2);

        service.flushMetrics();

        Map<String, Object> event = captureEvent();
        assertEquals("api", event.get("source"));
        assertEquals(2L, event.get("operations"));
        assertEquals(3L, event.get("pdfs"));
    }

    @Test
    void sendsOnlyDeltasBetweenFlushes() {
        service.recordOperation(1);
        service.flushMetrics();
        reset(postHogService);

        service.flushMetrics();
        verify(postHogService, never()).captureEvent(eq("pdf_operation_metrics"), anyMap());

        service.recordOperation(2);
        service.flushMetrics();

        Map<String, Object> event = captureEvent();
        assertEquals(1L, event.get("operations"));
        assertEquals(2L, event.get("pdfs"));
    }

    @Test
    void doesNothingWhenAnalyticsDisabled() {
        applicationProperties.getSystem().setEnableAnalytics(false);

        service.recordOperation(1);
        service.flushMetrics();

        verify(postHogService, never()).captureEvent(eq("pdf_operation_metrics"), anyMap());
    }

    private Map<String, Object> captureEvent() {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHogService).captureEvent(eq("pdf_operation_metrics"), captor.capture());
        return captor.getValue();
    }
}
