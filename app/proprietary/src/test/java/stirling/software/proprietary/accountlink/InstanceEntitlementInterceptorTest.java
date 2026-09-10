package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;

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

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private boolean preHandle(MockHttpServletResponse response) throws Exception {
        return interceptor()
                .preHandle(
                        new MockHttpServletRequest("GET", "/api/v1/ai/tools/x"),
                        response,
                        new Object());
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
        MockMultipartHttpServletRequest req = fileRequest("/api/v1/ai/tools/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object()); // stashes AI category
        interceptor.afterCompletion(req, resp, new Object(), null);

        // A tiny non-PDF input bills the 1-unit byte floor; a standalone op has a null key.
        verify(meter).accrue(eq(period), eq(BillingCategory.AI), eq(1L), isNull());
    }

    @Test
    void doesNotMeterFilelessBillableOp() throws Exception {
        // A billable op with no document (no multipart file) is not metered - matching SaaS, which
        // short-circuits a request that carries no file.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/tools/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        verify(meter, never()).accrue(any(), any(), anyLong(), any());
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
        // Materialise to a real path under @TempDir; the interceptor writes the PDF there so
        // jpdfium can read its page count back.
        TempFile temp = mock(TempFile.class);
        when(temp.getPath()).thenReturn(tmp.resolve("input.bin"));
        when(tempFileManager.createManagedTempFile(any())).thenReturn(temp);

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockMultipartHttpServletRequest req = new MockMultipartHttpServletRequest();
        req.setRequestURI("/api/v1/ai/tools/x");
        req.addFile(new MockMultipartFile("file", "doc.pdf", "application/pdf", fivePagePdf()));
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        // 5 pages, and a null key: a standalone op (no run) is its own charge - never deduped.
        verify(meter).accrue(eq(period), eq(BillingCategory.AI), eq(5L), isNull());
    }

    @Test
    void repeatedStandaloneOpsEachCharge() throws Exception {
        // A standalone op (no run id) has a null key, so identical calls each accrue - matching
        // SaaS, which never groups a call outside a run ("charge per API call"). The old
        // input-signature window wrongly collapsed these on the instance.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));
        authenticateWithApiKey();

        InstanceEntitlementInterceptor interceptor = interceptor();
        for (int call = 0; call < 2; call++) {
            MockMultipartHttpServletRequest req = fileRequest("/api/v1/general/merge");
            MockHttpServletResponse resp = new MockHttpServletResponse();
            interceptor.preHandle(req, resp, toolHandler());
            interceptor.afterCompletion(req, resp, toolHandler(), null);
        }

        verify(meter, times(2)).accrue(eq(period), eq(BillingCategory.API), anyLong(), isNull());
    }

    @Test
    void doesNotMeterWhenMeteringSwitchOff() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        when(meterProvider.getIfAvailable()).thenReturn(null); // metering.enabled = false

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/ai/tools/x");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        // Meter absent → no entitlement lookup, no accrual.
        verifyNoInteractions(entitlementCache);
    }

    @Test
    void gatesPolicyRunUpFrontEvenWithoutAutomationHeader() throws Exception {
        // The policy /run call carries no automation header, but must be blocked up front (not
        // after its first tool) when the instance is unlinked.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.block(GateDecision.Reason.NOT_LINKED));

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/policies/pol-1/run");
        MockHttpServletResponse resp = new MockHttpServletResponse();

        assertFalse(interceptor.preHandle(req, resp, new Object()));
        assertEquals(HttpStatus.PAYMENT_REQUIRED.value(), resp.getStatus());
        assertTrue(resp.getContentAsString().contains("ACCOUNT_LINK_REQUIRED"));
        verify(gate).evaluate(true); // gated as billable despite no automation header
    }

    @Test
    void doesNotMeterThePolicyRunEndpointItself() throws Exception {
        // Gated up front, but metered only via its dispatched tool sub-steps (category BYPASSED
        // here), so the /run request itself never accrues usage.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/policies/pol-1/run");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, new Object());
        interceptor.afterCompletion(req, resp, new Object(), null);

        verifyNoInteractions(meter);
    }

    @Test
    void billsApiKeyToolCallAsApi() throws Exception {
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));
        authenticateWithApiKey();

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockMultipartHttpServletRequest req = fileRequest("/api/v1/general/merge");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, toolHandler());
        interceptor.afterCompletion(req, resp, toolHandler(), null);

        verify(meter).accrue(eq(period), eq(BillingCategory.API), eq(1L), isNull());
    }

    @Test
    void doesNotBillApiKeyCallToNonToolEndpoint() throws Exception {
        // Matches SaaS: an API-key call to a non-tool endpoint (no @AutoJobPostMapping) is not
        // billed. Only tool operations count as API usage.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        authenticateWithApiKey();

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockHttpServletRequest req =
                new MockHttpServletRequest("GET", "/api/v1/general/files/some-id");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, plainHandler());
        interceptor.afterCompletion(req, resp, plainHandler(), null);

        verify(meter, never()).accrue(any(), any(), anyLong(), any());
    }

    @Test
    void policyRunSubStepsAccrueUnderTheSharedRunId() throws Exception {
        // Every sub-step of one policy run carries the same X-Stirling-Run-Id, so each accrues
        // under
        // that key and the meter collapses them to a single charge (the collapse itself is
        // UsageMeterServiceTest.skipsRepeatWithinWorkflowWindow). Without this, each transforming
        // step has a different input signature and is billed separately.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));

        InstanceEntitlementInterceptor interceptor = interceptor();
        for (int step = 0; step < 3; step++) {
            MockMultipartHttpServletRequest req = fileRequest("/api/v1/general/merge");
            req.addHeader("X-Stirling-Automation", "true");
            req.addHeader("X-Stirling-Run-Id", "run-1");
            MockHttpServletResponse resp = new MockHttpServletResponse();
            interceptor.preHandle(req, resp, new Object());
            interceptor.afterCompletion(req, resp, new Object(), null);
        }

        verify(meter, times(3))
                .accrue(eq(period), eq(BillingCategory.AUTOMATION), anyLong(), eq("run-1"));
    }

    @Test
    void forgedRunIdWithoutAutomationHeaderIsIgnored() throws Exception {
        // A raw API-key caller that sets X-Stirling-Run-Id but not the automation header must not
        // be
        // able to group its separate calls into one charge: the run id keys the meter only on a
        // genuine internal dispatch, so here the op falls back to its standalone null key.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));
        authenticateWithApiKey();

        InstanceEntitlementInterceptor interceptor = interceptor();
        MockMultipartHttpServletRequest req = fileRequest("/api/v1/general/merge");
        req.addHeader("X-Stirling-Run-Id", "forged");
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, toolHandler());
        interceptor.afterCompletion(req, resp, toolHandler(), null);

        verify(meter).accrue(eq(period), eq(BillingCategory.API), anyLong(), isNull());
    }

    @Test
    void multiDocumentRunChargesPerDocumentNotPerRun() throws Exception {
        // Two source documents in one run carry distinct document ids, so each accrues under its
        // own
        // key: the meter collapses a document's steps but bills the documents separately (matching
        // SaaS per-document lineage), rather than collapsing the whole run to a single charge.
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        UsageMeterService meter = mock(UsageMeterService.class);
        when(meterProvider.getIfAvailable()).thenReturn(meter);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(entitlementCache.current()).thenReturn(Optional.of(entitled(policy, period)));

        InstanceEntitlementInterceptor interceptor = interceptor();
        for (String docId : List.of("run-1:0", "run-1:0", "run-1:1")) {
            MockMultipartHttpServletRequest req = fileRequest("/api/v1/general/merge");
            req.addHeader("X-Stirling-Automation", "true");
            req.addHeader("X-Stirling-Run-Id", "run-1");
            req.addHeader("X-Stirling-Document-Id", docId);
            MockHttpServletResponse resp = new MockHttpServletResponse();
            interceptor.preHandle(req, resp, new Object());
            interceptor.afterCompletion(req, resp, new Object(), null);
        }

        // Keyed on the document id, not the run id: document run-1:0's two steps both accrue under
        // it (the meter dedups them), and run-1:1 accrues under its own key.
        verify(meter, times(2))
                .accrue(eq(period), eq(BillingCategory.AUTOMATION), anyLong(), eq("run-1:0"));
        verify(meter).accrue(eq(period), eq(BillingCategory.AUTOMATION), anyLong(), eq("run-1:1"));
    }

    private static MockMultipartHttpServletRequest fileRequest(String uri) {
        MockMultipartHttpServletRequest req = new MockMultipartHttpServletRequest();
        req.setRequestURI(uri);
        // A tiny non-PDF part: no page-count temp needed, and it bills the 1-unit byte floor.
        req.addFile(
                new MockMultipartFile(
                        "fileInput", "doc.bin", "application/octet-stream", "x".getBytes()));
        return req;
    }

    private static void authenticateWithApiKey() {
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(
                        new User(),
                        "test-api-key",
                        List.of(new SimpleGrantedAuthority("ROLE_API")));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    private static HandlerMethod toolHandler() {
        return handlerMethod("tool");
    }

    private static HandlerMethod plainHandler() {
        return handlerMethod("plain");
    }

    private static HandlerMethod handlerMethod(String name) {
        try {
            Method m = Fixture.class.getDeclaredMethod(name);
            return new HandlerMethod(new Fixture(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    static class Fixture {
        @AutoJobPostMapping(value = "/tool", resourceWeight = 1)
        public void tool() {}

        public void plain() {}
    }

    private static InstanceEntitlement entitled(UnitCalcPolicy policy, LocalDateTime period) {
        return new InstanceEntitlement(
                true, 0, 0, 100L, EntitlementState.OK, policy, period, period.plusMonths(1), null);
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
