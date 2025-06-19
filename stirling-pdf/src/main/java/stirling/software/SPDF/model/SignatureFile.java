package stirling.software.SPDF.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SignatureFile {
    private String fileName;
    private String category; // "Personal" or "Shared"
}
