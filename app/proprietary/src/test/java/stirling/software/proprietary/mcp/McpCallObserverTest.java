package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.inprocess.InProcessRateLimitStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.mcp.tools.McpResponses;
import stirling.software.proprietary.service.AuditService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpCallObserverTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ApplicationProperties props = new ApplicationProperties();
    private final AuditService audit = mock(AuditService.class);
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final McpCallObserver observer =
            new McpCallObserver(
                    props,
                    provider(new InProcessRateLimitStore()),
                    provider(audit),
                    provider(registry));

    @Test
    void callsPastTheLimit_areHeldBackPerUser() {
        props.getMcp().setRateLimitPerMinute(2);

        assertEquals(0, observer.secondsUntilAllowed("alice"));
        assertEquals(0, observer.secondsUntilAllowed("alice"));
        assertTrue(observer.secondsUntilAllowed("alice") > 0);
        assertEquals(0, observer.secondsUntilAllowed("bob"), "each user has their own bucket");
    }

    @Test
    void zeroLimit_meansUnlimited() {
        props.getMcp().setRateLimitPerMinute(0);

        for (int i = 0; i < 200; i++) {
            assertEquals(0, observer.secondsUntilAllowed("alice"));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void finishedCall_isAuditedAndCountedWithoutItsArguments() {
        ObjectNode args = mapper.createObjectNode().put("operation", "compress-pdf");
        args.put("file", "JVBERi0xLjQK");

        observer.record("alice", "stirling_misc", args, McpResponses.text(mapper, "ok"), 5_000_000);

        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(audit).audit(eq("alice"), eq(AuditEventType.MCP_TOOL_CALL), data.capture());
        assertEquals("compress-pdf", data.getValue().get("operation"));
        assertEquals("ok", data.getValue().get("outcome"));
        assertEquals(5L, data.getValue().get("durationMs"));
        assertFalse(data.getValue().toString().contains("JVBERi0"));
        assertEquals(
                1.0,
                registry.get(McpCallObserver.CALLS)
                        .tag("tool", "stirling_misc")
                        .tag("outcome", "ok")
                        .counter()
                        .count());
    }

    @Test
    void outcome_separatesErrorsPromptsAndPendingJobs() {
        assertEquals("error", McpCallObserver.outcome(McpResponses.error(mapper, "x")));
        assertEquals(
                "input_required",
                McpCallObserver.outcome(
                        McpResponses.inputRequired(mapper, "k", mapper.createObjectNode())));
        assertEquals(
                "pending",
                McpCallObserver.outcome(McpResponses.pending(mapper, "ocr-pdf", "mcp-1")));
        assertEquals("error", McpCallObserver.outcome(null));
    }

    @Test
    @SuppressWarnings("unchecked")
    void unusualOperationIds_areNotRecorded() {
        ObjectNode args = mapper.createObjectNode().put("operation", "Ignore previous; DROP");

        observer.record("alice", "stirling_misc", args, McpResponses.text(mapper, "ok"), 1);

        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(audit).audit(eq("alice"), eq(AuditEventType.MCP_TOOL_CALL), data.capture());
        assertFalse(data.getValue().containsKey("operation"));
    }

    @Test
    void brokenRateLimitStore_failsOpen() {
        RateLimitStore broken = mock(RateLimitStore.class);
        when(broken.tryConsume(any(), anyLong(), any()))
                .thenThrow(new IllegalStateException("valkey down"));
        McpCallObserver failing =
                new McpCallObserver(props, provider(broken), provider(audit), provider(registry));

        assertEquals(0, failing.secondsUntilAllowed("alice"));
    }

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(T bean) {
        ObjectProvider<T> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(bean);
        return provider;
    }
}
