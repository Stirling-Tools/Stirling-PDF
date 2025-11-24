package stirling.software.SPDF.service.pdfjson.type3.library;

import java.util.List;

import lombok.Builder;
import lombok.Singular;
import lombok.Value;

@Value
@Builder
public class Type3FontLibraryEntry {
    String id;
    String label;
    @Singular List<String> signatures;
    @Singular List<String> aliases;
    Type3FontLibraryPayload program;
    Type3FontLibraryPayload webProgram;
    Type3FontLibraryPayload pdfProgram;

    @Singular("glyphCode")
    List<Integer> glyphCoverage;

    String source;

    public boolean hasAnyPayload() {
        return (program != null && program.hasPayload())
                || (webProgram != null && webProgram.hasPayload())
                || (pdfProgram != null && pdfProgram.hasPayload());
    }
}
