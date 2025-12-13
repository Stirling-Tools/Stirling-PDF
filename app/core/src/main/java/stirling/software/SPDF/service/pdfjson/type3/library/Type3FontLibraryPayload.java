package stirling.software.SPDF.service.pdfjson.type3.library;

import lombok.Value;

@Value
public class Type3FontLibraryPayload {
    String base64;
    String format;

    public boolean hasPayload() {
        return base64 != null && !base64.isBlank();
    }
}
