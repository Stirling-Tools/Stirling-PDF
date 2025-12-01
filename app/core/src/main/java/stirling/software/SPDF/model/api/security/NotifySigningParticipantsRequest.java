package stirling.software.SPDF.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class NotifySigningParticipantsRequest {

    @Schema(description = "Participants to notify; defaults to all if omitted")
    private List<String> participantEmails;

    @Schema(description = "Notification message to deliver")
    private String message;
}
