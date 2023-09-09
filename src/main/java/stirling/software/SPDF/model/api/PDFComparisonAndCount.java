package stirling.software.SPDF.model.api;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.NoArgsConstructor;
import stirling.software.SPDF.utils.GeneralUtils;
@Data
@NoArgsConstructor
public class PDFComparisonAndCount extends PDFComparison {
	@Schema(description = "Count")
    private String pageCount;

	
}
