package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.saas.accountlink.InstanceAiGatewayService.EngineReply;

/**
 * The gateway through Spring's own dispatch, which picks the response writer from the declared
 * return type; calling the controller directly cannot catch a wrong choice there.
 */
class InstanceAiControllerDispatchTest {

    private InstanceAiGatewayService gateway;
    private InstanceAiUsageService usageService;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        gateway = mock(InstanceAiGatewayService.class);
        usageService = mock(InstanceAiUsageService.class);
        mvc =
                MockMvcBuilders.standaloneSetup(
                                new InstanceAiController(gateway, usageService, true))
                        .build();
    }

    private static LinkedInstanceAuthenticationToken instance() {
        return new LinkedInstanceAuthenticationToken(42L, 99L);
    }

    private static EngineReply reply(int status, String contentType, String body) {
        return new EngineReply(
                status,
                contentType,
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void theOrchestratorStreamReachesTheInstanceAsNdjson() throws Exception {
        String frames = "{\"event\":\"progress\"}\n{\"event\":\"result\"}\n";
        when(gateway.forward(
                        eq("POST"),
                        eq("/api/v1/orchestrator"),
                        isNull(),
                        anyString(),
                        eq(42L),
                        eq("alice")))
                .thenReturn(reply(200, "application/x-ndjson", frames));

        MvcResult started =
                mvc.perform(
                                post("/api/v1/instance/ai/api/v1/orchestrator")
                                        .principal(instance())
                                        .header("X-User-Id", "alice")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{}"))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        mvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_NDJSON))
                .andExpect(content().string(frames));

        verify(usageService).recordCall(99L, 42L, "/api/v1/orchestrator");
    }

    @Test
    void aJsonReplyIsPassedThroughAsJson() throws Exception {
        when(gateway.forward(eq("GET"), eq("/health"), isNull(), isNull(), eq(42L), eq("alice")))
                .thenReturn(reply(200, "application/json", "{\"status\":\"ok\"}"));

        MvcResult started =
                mvc.perform(
                                get("/api/v1/instance/ai/health")
                                        .principal(instance())
                                        .header("X-User-Id", "alice"))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        mvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"status\":\"ok\"}"));
    }

    @Test
    void anEngineErrorKeepsItsStatusAndIsNotBilled() throws Exception {
        when(gateway.forward(
                        eq("POST"), eq("/api/v1/pdf/edit"), isNull(), anyString(), eq(42L), any()))
                .thenReturn(reply(422, "application/json", "{\"detail\":\"bad plan\"}"));

        MvcResult started =
                mvc.perform(
                                post("/api/v1/instance/ai/api/v1/pdf/edit")
                                        .principal(instance())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{}"))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        mvc.perform(asyncDispatch(started))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().json("{\"detail\":\"bad plan\"}"));

        verify(usageService, never()).recordCall(any(), any(), any());
    }

    @Test
    void queryParametersReachTheGatewayWithThePath() throws Exception {
        // The math auditor sends its tolerance as a query parameter; dropping it ran defaults.
        when(gateway.forward(
                        eq("POST"),
                        eq("/api/v1/ai/math-auditor-agent/deliberate"),
                        eq("tolerance=0.01"),
                        anyString(),
                        eq(42L),
                        any()))
                .thenReturn(reply(200, "application/json", "{\"verdict\":\"ok\"}"));

        MvcResult started =
                mvc.perform(
                                post("/api/v1/instance/ai/api/v1/ai/math-auditor-agent/deliberate?tolerance=0.01")
                                        .principal(instance())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content("{}"))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        mvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"verdict\":\"ok\"}"));

        verify(usageService).recordCall(99L, 42L, "/api/v1/ai/math-auditor-agent/deliberate");
    }

    @Test
    void sharingOffAnswersPlainlyWithoutDiallingTheEngine() throws Exception {
        MockMvc off =
                MockMvcBuilders.standaloneSetup(
                                new InstanceAiController(gateway, usageService, false))
                        .build();

        MvcResult started =
                off.perform(get("/api/v1/instance/ai/health").principal(instance()))
                        .andExpect(request().asyncStarted())
                        .andReturn();

        MvcResult done =
                off.perform(asyncDispatch(started))
                        .andExpect(status().isServiceUnavailable())
                        .andReturn();

        assertThat(done.getResponse().getContentAsString()).contains("sharing is not enabled");
        verify(gateway, never()).forward(any(), any(), any(), any(), any(), any());
    }
}
