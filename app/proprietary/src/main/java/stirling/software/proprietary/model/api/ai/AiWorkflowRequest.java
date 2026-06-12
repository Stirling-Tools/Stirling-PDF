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
// TODO: Migration required - fileInputs binding is still incomplete: AiWorkflowFileInput.fileInput
// is the Spring-compat stirling.software.common.model.MultipartFile, which RESTEasy cannot
// populate. It must be ported to org.jboss.resteasy.reactive.multipart.FileUpload (wrapped via
// FileUploadMultipartFile.of(...)) before the uploaded PDFs actually bind from the form body.
@Data
@Schema(description = "Run an AI workflow")
public class AiWorkflowRequest {

    // TODO: Migration required - not yet @RestForm-bound. fileInputs is a list of multipart files
    // (blocked on the MultipartFile -> FileUpload port noted above); annotating it as @RestForm now
    // makes RESTEasy look for a body converter and fail augmentation.
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
