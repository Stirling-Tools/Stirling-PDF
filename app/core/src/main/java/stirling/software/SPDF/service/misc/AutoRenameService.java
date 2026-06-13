package stirling.software.SPDF.service.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;

public interface AutoRenameService {
    ResponseEntity<Resource> extractHeader(ExtractHeaderRequest request) throws IOException;
}
