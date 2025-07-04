package stirling.software.SPDF.controller.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.agent.AgentRequest;
import stirling.software.SPDF.model.api.agent.AgentResponse;
import stirling.software.SPDF.service.agent.GeminiAgentService;


import java.util.List;


@RestController
@RequestMapping("/api/v1/agent")
@Tag(name = "Agent", description = "Gemini Agent APIs")
@RequiredArgsConstructor
public class GeminiAgentController {

    @Autowired
    private GeminiAgentService geminiAgentService;

    @PostMapping(value = "/execute", consumes = { MediaType.MULTIPART_FORM_DATA_VALUE })
    @Operation(
            summary = "Process a user request through the Gemini agent",
            description = "This endpoint takes a user prompt and optional files, processes them using the Gemini agent, and returns the result.")
    public ResponseEntity<AgentResponse> executeTask(
            @RequestPart(name = "request", required = true) AgentRequest agentRequestDetails,
            @RequestPart(name = "files", required = false) List<MultipartFile> files) {

        // The AgentRequest DTO might need adjustment if MultipartFile is directly included.
        // For now, we assume file references or that files are handled separately by the service.
        // This example assumes files are passed to the service.

        AgentResponse response = geminiAgentService.processRequest(
                agentRequestDetails.getUserPrompt(),
                files,
                agentRequestDetails.getAdditionalParams());

        return ResponseEntity.ok(response);
    }
}
