package stirling.software.proprietary.model.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class TeamWithUserCountDTO {
    private Long id;
    private String name;
    private Long userCount;

    // Constructor for JPQL projection
    public TeamWithUserCountDTO(Long id, String name, Long userCount) {
        this.id = id;
        this.name = name;
        this.userCount = userCount;
    }
}
