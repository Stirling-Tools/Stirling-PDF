package stirling.software.SPDF.service.misc;

import java.io.IOException;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;
import stirling.software.SPDF.model.api.misc.FileResponseData;

public interface AutoRenameService {
    FileResponseData extractHeader(ExtractHeaderRequest request) throws IOException;
}
