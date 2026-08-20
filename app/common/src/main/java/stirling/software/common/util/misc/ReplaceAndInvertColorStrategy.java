package stirling.software.common.util.misc;

import java.io.IOException;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.model.io.InputStreamResource;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class ReplaceAndInvertColorStrategy extends PDFFile {

    protected ReplaceAndInvert replaceAndInvert;

    public ReplaceAndInvertColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        setFileInput(file);
        this.replaceAndInvert = replaceAndInvert;
    }

    public abstract InputStreamResource replace() throws IOException;
}
