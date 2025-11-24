package stirling.software.SPDF.service.pdfjson.type3.library;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class Type3FontLibraryMatch {
    Type3FontLibraryEntry entry;
    String matchType;
    String signature;
}
