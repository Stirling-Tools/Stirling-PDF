package stirling.software.common.util.misc;

import java.io.IOException;

// TODO: Migration required - org.springframework.core.io.InputStreamResource is the return
// type of the public abstract replace() method, implemented by subclasses and consumed by
// callers. Replacing it (e.g. with InputStream/StreamingOutput) would ripple across the
// strategy subclasses and their callers, so it is kept until they are migrated together.
import stirling.software.common.model.io.InputStreamResource;
// TODO: Migration required - org.springframework.web.multipart.MultipartFile is required by
// the inherited PDFFile.setFileInput(MultipartFile) (PDFFile keeps this type for the same
// reason); changing this constructor parameter would ripple to callers and the API binding
// layer, so the type is kept until PDFFile and its callers are migrated together.
import stirling.software.common.model.MultipartFile;

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
        this.replaceAndInvert = replaceAndInvert;
    }

    public abstract InputStreamResource replace() throws IOException;
}
