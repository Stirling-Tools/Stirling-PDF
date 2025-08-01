package stirling.software.proprietary.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrganizationWithTeamCountDTO {
    private Long id;
    private String name;
    private String description;
    private Long teamCount;
}
