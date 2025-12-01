package stirling.software.SPDF.model.api.security;

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
            description = "Emails of participants to invite for signing",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<String> participantEmails;

    @Schema(description = "Names of participants aligned with participantEmails")
    private List<String> participantNames;

    @Schema(description = "Optional message included in notifications")
    private String message;

    @Schema(description = "Optional due date for reminders (ISO-8601 date)")
    private String dueDate;

    @Schema(description = "Whether to send notifications immediately")
    private Boolean notifyOnCreate;
}
