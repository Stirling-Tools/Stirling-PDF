package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.ai.AiWorkflowRequest;
import stirling.software.SPDF.model.api.ai.AiWorkflowResponse;
import stirling.software.SPDF.service.AiEngineClient;
import stirling.software.SPDF.service.AiWorkflowService;

@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI Engine", description = "Proxy endpoints for the Stirling AI engine")
public class AiEngineController {

    private final AiEngineClient aiEngineClient;
    private final AiWorkflowService aiWorkflowService;

    @GetMapping("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public ResponseEntity<String> health() throws IOException, InterruptedException {
        String response = aiEngineClient.get("/health");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/orchestrate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run an AI workflow against a PDF",
            description =
                    "Accepts a PDF upload, asks Python what it needs next, performs Java-side"
                            + " extraction work, and loops until Python returns a final result")
    public ResponseEntity<AiWorkflowResponse> orchestrate(@ModelAttribute AiWorkflowRequest request)
            throws IOException, InterruptedException {
        return ResponseEntity.ok(aiWorkflowService.orchestrate(request));
    }

    @PostMapping(value = "/pdf/edit", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Generate a PDF edit plan",
            description =
                    "Sends a user message to the PDF edit agent which returns a structured plan"
                            + " of tool operations to perform")
    public ResponseEntity<String> pdfEdit(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/pdf/edit", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/agents/draft", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Draft an agent specification",
            description =
                    "Sends a user message to the agent drafting workflow to create a new agent"
                            + " specification")
    public ResponseEntity<String> draftAgent(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/agents/draft", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/agents/revise", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Revise an agent specification",
            description =
                    "Sends a user message and current draft to the agent revision workflow to"
                            + " update an existing agent specification")
    public ResponseEntity<String> reviseAgent(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/agents/revise", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping(value = "/agents/next-action", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Get next execution action for an agent",
            description =
                    "Given an agent spec and current execution state, returns the next tool call"
                            + " action to perform")
    public ResponseEntity<String> nextAction(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/agents/next-action", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }
}
