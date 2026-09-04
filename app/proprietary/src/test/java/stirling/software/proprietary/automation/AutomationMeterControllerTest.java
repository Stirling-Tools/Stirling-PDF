package stirling.software.proprietary.automation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import stirling.software.proprietary.audit.AuditContext;
import stirling.software.proprietary.automation.AutomationMeterController.AutomationMeterRequest;
import stirling.software.proprietary.automation.AutomationMeterController.InputDoc;
import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;

class AutomationMeterControllerTest {

    @SuppressWarnings("unchecked")
    private static ObjectProvider<AutomationRunBiller> providerOf(AutomationRunBiller biller) {
        ObjectProvider<AutomationRunBiller> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(biller);
        return provider;
    }

    private static AutomationMeterRequest req(List<InputDoc> inputs) {
        return new AutomationMeterRequest("My run", List.of("compress", "rotate"), inputs);
    }

    @Test
    void billsInputsAndStampsAudit() {
        AutomationRunBiller biller = mock(AutomationRunBiller.class);
        AutomationMeterController controller = new AutomationMeterController(providerOf(biller));
        MockHttpServletRequest http = new MockHttpServletRequest();

        var response =
                controller.meterAutomationRun(
                        req(List.of(new InputDoc(3, 1000L), new InputDoc(0, 2048L))), http);

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        ArgumentCaptor<List<FileSize>> captor = ArgumentCaptor.forClass(List.class);
        verify(biller).recordAutomationRun(captor.capture());
        assertEquals(List.of(new FileSize(3, 1000L), new FileSize(0, 2048L)), captor.getValue());
        assertEquals("My run", http.getAttribute(AuditContext.REQ_ATTR_POLICY_NAME));
        assertEquals(
                List.of("compress", "rotate"),
                http.getAttribute(AuditContext.REQ_ATTR_POLICY_STEPS));
    }

    @Test
    void emptyInputsDoesNotBill() {
        AutomationRunBiller biller = mock(AutomationRunBiller.class);
        AutomationMeterController controller = new AutomationMeterController(providerOf(biller));

        var response = controller.meterAutomationRun(req(List.of()), new MockHttpServletRequest());

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        verify(biller, never()).recordAutomationRun(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void nullBodyIsAccepted() {
        AutomationRunBiller biller = mock(AutomationRunBiller.class);
        AutomationMeterController controller = new AutomationMeterController(providerOf(biller));

        var response = controller.meterAutomationRun(null, new MockHttpServletRequest());

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        verify(biller, never()).recordAutomationRun(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void noBillerBeanStillAccepts() {
        AutomationMeterController controller = new AutomationMeterController(providerOf(null));

        var response =
                controller.meterAutomationRun(
                        req(List.of(new InputDoc(1, 10L))), new MockHttpServletRequest());

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
    }

    @Test
    void billingExceptionIsSwallowed() {
        AutomationRunBiller biller = mock(AutomationRunBiller.class);
        org.mockito.Mockito.doThrow(new RuntimeException("boom"))
                .when(biller)
                .recordAutomationRun(org.mockito.ArgumentMatchers.anyList());
        AutomationMeterController controller = new AutomationMeterController(providerOf(biller));

        var response =
                controller.meterAutomationRun(
                        req(List.of(new InputDoc(1, 10L))), new MockHttpServletRequest());

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
    }

    @Test
    void clampsNegativesAndCapsInputCount() {
        AutomationRunBiller biller = mock(AutomationRunBiller.class);
        AutomationMeterController controller = new AutomationMeterController(providerOf(biller));

        List<InputDoc> many =
                IntStream.range(0, 10_050).mapToObj(i -> new InputDoc(-5, -1L)).toList();
        controller.meterAutomationRun(
                new AutomationMeterRequest(null, null, many), new MockHttpServletRequest());

        ArgumentCaptor<List<FileSize>> captor = ArgumentCaptor.forClass(List.class);
        verify(biller).recordAutomationRun(captor.capture());
        List<FileSize> billed = captor.getValue();
        assertEquals(10_000, billed.size());
        assertTrue(billed.stream().allMatch(f -> f.pages() == 0 && f.bytes() == 0L));
    }
}
