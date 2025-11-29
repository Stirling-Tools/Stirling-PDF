package stirling.software.proprietary.model.api.signature;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SavedSignatureResponse {
    private String id;
    private String label;
    private String type; // "canvas", "image", "text"
    private String scope; // "personal", "shared"
    private String dataUrl; // For canvas and image types (or URL to fetch image)
    private String signerName; // For text type
    private String fontFamily; // For text type
    private Integer fontSize; // For text type
    private String textColor; // For text type
    private Long createdAt;
    private Long updatedAt;
}
