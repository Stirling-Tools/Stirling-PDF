package stirling.software.SPDF.model.api.security;

import java.util.List;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ManualRedactPdfRequest extends PDFFile {
    List<RedactionArea> redactions;
}
