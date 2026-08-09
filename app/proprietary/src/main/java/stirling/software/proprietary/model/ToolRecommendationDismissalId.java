package stirling.software.proprietary.model;

import java.io.Serializable;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ToolRecommendationDismissalId implements Serializable {

    private static final long serialVersionUID = 1L;

    private String principal;
    private String contextTool;
    private String dismissedTool;
}
