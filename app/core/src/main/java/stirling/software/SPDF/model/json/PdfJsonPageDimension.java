package stirling.software.SPDF.model.json;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_DEFAULT)
public class PdfJsonPageDimension {
    private int pageNumber;
    private float width;
    private float height;
    private int rotation;
}
