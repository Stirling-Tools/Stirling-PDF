package stirling.software.SPDF.model.api.signature;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class SavedSignatureRequest {
    private String id;
    private String label;
    private String type; // "canvas", "image", "text"
    private String scope; // "personal", "shared"
    private String dataUrl; // For canvas and image types
    private String signerName; // For text type
    private String fontFamily; // For text type
    private Integer fontSize; // For text type
    private String textColor; // For text type
}
