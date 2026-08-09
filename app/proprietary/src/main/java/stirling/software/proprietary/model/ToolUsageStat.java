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
 * One UTC day's tally of "this principal ran toolKey, having just come from fromTool". Frequency is
 * this table grouped by tool; transitions are it filtered by fromTool - so one row per completion
 * serves both recommendation signals, and a busy day stays a handful of rows rather than thousands.
 *
 * <p>{@link #NO_PREVIOUS_TOOL} marks a run with no distinct predecessor. It is the empty string,
 * which no valid tool key can be.
 */
@Entity
@Table(
        name = "tool_usage_stats",
        indexes = {
            @Index(name = "idx_tool_usage_day", columnList = "epoch_day"),
            @Index(name = "idx_tool_usage_principal_day", columnList = "principal, epoch_day"),
            @Index(name = "idx_tool_usage_from_day", columnList = "from_tool, epoch_day")
        })
@IdClass(ToolUsageStatId.class)
@Getter
@Setter
@NoArgsConstructor
public class ToolUsageStat implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String NO_PREVIOUS_TOOL = "";

    @Id
    @Column(name = "principal", length = 255)
    private String principal;

    @Id
    @Column(name = "from_tool", length = 64)
    private String fromTool;

    @Id
    @Column(name = "tool_key", length = 64)
    private String toolKey;

    @Id
    @Column(name = "epoch_day")
    private long epochDay;

    @Column(name = "count")
    private long count;

    public ToolUsageStat(
            String principal, String fromTool, String toolKey, long epochDay, long count) {
        this.principal = principal;
        this.fromTool = fromTool;
        this.toolKey = toolKey;
        this.epochDay = epochDay;
        this.count = count;
    }
}
