package stirling.software.common.util.misc;

import java.io.IOException;

import org.springframework.core.io.InputStreamResource;
import org.springframework.web.multipart.MultipartFile;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.api.misc.ReplaceAndInvert;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class ReplaceAndInvertColorStrategy extends PDFFile {

    protected ReplaceAndInvert replaceAndInvert;

    public ReplaceAndInvertColorStrategy(MultipartFile file, ReplaceAndInvert replaceAndInvert) {
        setFileInput(file);
        setReplaceAndInvert(replaceAndInvert);
    }

    public abstract InputStreamResource replace() throws IOException;
}
