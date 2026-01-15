package stirling.software.common.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class CreateSigningSessionRequest extends PDFFile {

    @Schema(description = "Owner email used for activity updates")
    private String ownerEmail;

    @Schema(
            description = "User IDs of participants to invite for signing",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<Long> participantUserIds;

    @Schema(description = "Optional message included in notifications")
    private String message;

    @Schema(description = "Optional due date for reminders (ISO-8601 date)")
    private String dueDate;

    @Schema(description = "Whether to send notifications immediately")
    private Boolean notifyOnCreate;

    // Signature appearance settings (owner-controlled, applied to all participants)
    @Schema(description = "Whether to show visible signature")
    private Boolean showSignature;

    @Schema(description = "Page number for signature (1-indexed)")
    private Integer pageNumber;

    @Schema(description = "Signature reason")
    private String reason;

    @Schema(description = "Signature location")
    private String location;

    @Schema(description = "Whether to show Stirling PDF logo in signature")
    private Boolean showLogo;
}
