package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.AiEngineClient;

@Slf4j
@RestController
@RequestMapping("/api/v1/ai")
@RequiredArgsConstructor
@Tag(name = "AI Engine", description = "Proxy endpoints for the Stirling AI engine")
public class AiEngineController {

    private final AiEngineClient aiEngineClient;

    @GetMapping("/health")
    @Operation(
            summary = "AI engine health check",
            description = "Returns the health status of the AI engine including configured models")
    public ResponseEntity<String> health() throws IOException, InterruptedException {
        String response = aiEngineClient.get("/health");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping("/orchestrate")
    @Operation(
            summary = "Orchestrate an AI request",
            description =
                    "Sends a user message to the orchestrator agent which routes it to the"
                            + " appropriate specialist agent")
    public ResponseEntity<String> orchestrate(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/orchestrator", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping("/pdf/edit")
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

    @PostMapping("/pdf/questions")
    @Operation(
            summary = "Answer questions about a PDF",
            description =
                    "Sends a question and extracted PDF text to the question-answering agent")
    public ResponseEntity<String> pdfQuestions(@RequestBody String requestBody)
            throws IOException, InterruptedException {
        String response = aiEngineClient.post("/api/v1/pdf/questions", requestBody);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(response);
    }

    @PostMapping("/agents/draft")
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

    @PostMapping("/agents/revise")
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

    @PostMapping("/agents/next-action")
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
