package stirling.software.SPDF.model.json;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class TextColorUsage {
    private String hexColor;
    private long occurrenceCount;
}
