package stirling.software.proprietary.model;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A principal's opt-out: never recommend {@code dismissedTool} while they are on {@code
 * contextTool}. A context of {@code *} suppresses the tool in every context. The whole row is its
 * own key, so saving one twice is a no-op rather than a duplicate.
 */
@Entity
@Table(
        name = "tool_recommendation_dismissals",
        indexes = @Index(name = "idx_tool_rec_dismissal_principal", columnList = "principal"))
@IdClass(ToolRecommendationDismissalId.class)
@Getter
@Setter
@NoArgsConstructor
public class ToolRecommendationDismissal implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ANY_CONTEXT = "*";

    @Id
    @Column(name = "principal", length = 255)
    private String principal;

    @Id
    @Column(name = "context_tool", length = 64)
    private String contextTool;

    @Id
    @Column(name = "dismissed_tool", length = 64)
    private String dismissedTool;

    public ToolRecommendationDismissal(String principal, String contextTool, String dismissedTool) {
        this.principal = principal;
        this.contextTool = contextTool;
        this.dismissedTool = dismissedTool;
    }
}
