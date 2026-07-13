package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.notNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockMultipartHttpServletRequest;

import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.UnitCalcPolicy;

@ExtendWith(MockitoExtension.class)
class InstanceEntitlementInterceptorTest {

    @Mock private InstanceEntitlementGate gate;
    @Mock private EntitlementCache entitlementCache;
    @Mock private ObjectProvider<UsageMeterService> meterProvider;
    @Mock private TempFileManager tempFileManager;

    private InstanceEntitlementInterceptor interceptor() {
        return new InstanceEntitlementInterceptor(
                gate, entitlementCache, meterProvider, tempFileManager);
    }

    private boolean preHandle(MockHttpServletResponse response) throws Exception {
        return interceptor()
                .preHandle(
                        new MockHttpServletRequest("GET", "/api/v1/ai/x"), response, new Object());
    }

    @Test
    void allowsWhenGateAllows() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(preHandle(response));
        assertEquals(200, response.getStatus());
    }

    @Test
    void blocksWith402AndLinkSignalWhenGateBlocks() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.block(GateDecision.Reason.NOT_LINKED));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertFalse(preHandle(response));
        assertEquals(HttpStatus.PAYMENT_REQUIRED.value(), response.getStatus());
        assertEquals("application/json", response.getContentType());
        assertTrue(response.getContentAsString().contains("ACCOUNT_LINK_REQUIRED"));
        assertTrue(response.getContentAsString().contains("NOT_LINKED"));
    }

    @Test
    void failsOpenWhenGateThrows() throws Exception {
        // A DB / SaaS blip while resolving entitlement must never hard-block billable work.
        when(gate.evaluate(anyBoolean()))
                .thenThrow(new RuntimeException("entitlement source down"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        assertTrue(preHandle(response));
        assertEquals(200, response.getStatus());
    }

    @Test
    void metersSuccessfulBillableOp() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object()); // stashes AI category
        interceptor.afterCompletion(req, resp, new Object(), null);

        // No uploaded files → bytes axis → the 1-unit floor; no input identity → null signature.
        verify(meter).accrue(eq(period), eq(BillingCategory.AI), eq(1L), isNull());
    }

    @Test
    void metersPdfByPageCountNotJustBytes(@TempDir Path tmp) throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        // docPagesPerUnit=1, docBytesPerUnit=1MB → a tiny 5-page PDF costs 5 on the page axis but
        // only 1 on the byte axis: page-counting (via jpdfium) is what makes this bill correctly.
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));
        // Materialise to a real path under @TempDir; the interceptor writes the upload there and
        // jpdfium + the hasher read it back.
        TempFile temp = mock(TempFile.class);
        when(temp.getPath()).thenReturn(tmp.resolve("input.bin"));
        when(tempFileManager.createManagedTempFile(any())).thenReturn(temp);

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockMultipartHttpServletRequest req = new MockMultipartHttpServletRequest();
        req.setRequestURI("/api/v1/ai/x");
        req.addFile(new MockMultipartFile("file", "doc.pdf", "application/pdf", fivePagePdf()));
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        // 5 pages + a non-null input-set signature (file ops carry a dedup key).
        verify(meter).accrue(eq(period), eq(BillingCategory.AI), eq(5L), notNull());
    }

    @Test
    void doesNotMeterWhenMeteringSwitchOff() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        when(meterProvider.getIfAvailable()).thenReturn(null); // metering.enabled = false

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        // Meter absent → no entitlement lookup, no accrual.
        verifyNoInteractions(entitlementCache);
    }

    private static InstanceEntitlement entitled(UnitCalcPolicy policy, LocalDateTime period) {
        return new InstanceEntitlement(
                true, 0, 0, 100L, EntitlementState.OK, policy, period, period.plusMonths(1));
    }

    private static byte[] fivePagePdf() throws Exception {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < 5; i++) {
                doc.addPage(new PDPage());
            }
            doc.save(out);
            return out.toByteArray();
        }
    }
}
