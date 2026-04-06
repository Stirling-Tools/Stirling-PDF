package stirling.software.SPDF.controller.api.ai;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import stirling.software.SPDF.model.ai.AgentInfo;
import stirling.software.SPDF.model.ai.ChatRequest;
import stirling.software.SPDF.service.ai.EngineClientService;

/**
 * SSE proxy controller that forwards agent chat requests to the Python engine and streams events
 * back to the frontend.
 */
@RestController
@RequestMapping("/api/v1/ai")
public class AgentChatController {

    private static final Logger log = LoggerFactory.getLogger(AgentChatController.class);
    private static final long SSE_TIMEOUT_MS = 5 * 60 * 1000L; // 5 minutes

    private final EngineClientService engineClient;

    public AgentChatController(EngineClientService engineClient) {
        this.engineClient = engineClient;
    }

    /** Stream a chat session via SSE. Proxies events from the Python engine. */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        // Use a virtual thread to read from the engine and push events.
        Thread.ofVirtual().name("agent-chat-stream").start(() -> proxyStream(emitter, request));

        return emitter;
    }

    /** List available AI agents. */
    @GetMapping("/agents")
    public ResponseEntity<List<AgentInfo>> listAgents() {
        try {
            return ResponseEntity.ok(engineClient.listAgents());
        } catch (Exception e) {
            log.error("Failed to list agents from engine", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private void proxyStream(SseEmitter emitter, ChatRequest request) {
        try (InputStream stream = engineClient.streamChat(request);
                BufferedReader reader =
                        new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {

            String currentEvent = "message";
            StringBuilder dataBuffer = new StringBuilder();
            String line;

            while ((line = reader.readLine()) != null) {
                if (line.startsWith("event: ")) {
                    currentEvent = line.substring(7).trim();
                } else if (line.startsWith("data: ")) {
                    dataBuffer.append(line.substring(6));
                } else if (line.isEmpty() && dataBuffer.length() > 0) {
                    // End of SSE event — forward it
                    try {
                        emitter.send(
                                SseEmitter.event().name(currentEvent).data(dataBuffer.toString()));
                    } catch (Exception e) {
                        // Client disconnected
                        log.debug("Client disconnected during SSE stream");
                        return;
                    }
                    currentEvent = "message";
                    dataBuffer.setLength(0);
                }
            }

            emitter.complete();
        } catch (Exception e) {
            log.error("Error proxying agent chat stream", e);
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {
                // emitter already completed or timed out
            }
        }
    }
}
