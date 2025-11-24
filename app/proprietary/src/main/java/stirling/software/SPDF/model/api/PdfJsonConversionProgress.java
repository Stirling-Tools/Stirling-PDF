package stirling.software.SPDF.model.api;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PdfJsonConversionProgress {
    private int percent;
    private String stage;
    private String message;
    private boolean complete;
    private Integer current; // Current item being processed (e.g., page number)
    private Integer total; // Total items to process (e.g., total pages)

    public static PdfJsonConversionProgress of(int percent, String stage, String message) {
        return PdfJsonConversionProgress.builder()
                .percent(percent)
                .stage(stage)
                .message(message)
                .complete(false)
                .build();
    }

    public static PdfJsonConversionProgress of(
            int percent, String stage, String message, int current, int total) {
        return PdfJsonConversionProgress.builder()
                .percent(percent)
                .stage(stage)
                .message(message)
                .current(current)
                .total(total)
                .complete(false)
                .build();
    }

    public static PdfJsonConversionProgress complete() {
        return PdfJsonConversionProgress.builder()
                .percent(100)
                .stage("complete")
                .message("Conversion complete")
                .complete(true)
                .build();
    }
}
