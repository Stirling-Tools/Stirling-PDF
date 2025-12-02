package stirling.software.common.model.api.security;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AddParticipantsRequest {
    private List<String> participantEmails;
    private List<String> participantNames;
}
