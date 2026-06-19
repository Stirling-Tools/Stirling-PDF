package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

// MIGRATION: this is a @BeanParam target on multipart @POST endpoints (AiEngineController
// orchestrate / orchestrateStream). RESTEasy Reactive binds @BeanParam from annotated FIELDS, so
// each multipart part needs an explicit @RestForm; without any annotated field augmentation fails
// with "No annotations found on fields ...".
@Data
@Schema(description = "Run an AI workflow")
public class AiWorkflowRequest {

    // Not bound directly from the bean - RESTEasy Reactive cannot map a List of POJOs-with-files
    // from multipart. The controller binds the repeated "fileInput" parts as List<FileUpload> and
    // populates this via setFileInputs(...).
    @Schema(description = "The input PDF files")
    private List<AiWorkflowFileInput> fileInputs = new ArrayList<>();

    @RestForm("userMessage")
    @NotBlank
    @Schema(description = "The user message to orchestrate", example = "Summarise these documents")
    private String userMessage;

    // TODO: Migration required - conversationHistory is a list of POJOs; RESTEasy has no form
    // converter for AiConversationMessage. It must be received as a JSON form part (e.g. a String
    // field parsed with ObjectMapper, or a @RestForm @PartType(APPLICATION_JSON) field) once the
    // multipart contract for this endpoint is finalised.
    @Schema(
            description =
                    "Prior chat messages exchanged between the user and the assistant, ordered"
                            + " oldest-first. Excludes the current userMessage.")
    private List<AiConversationMessage> conversationHistory = new ArrayList<>();
}
