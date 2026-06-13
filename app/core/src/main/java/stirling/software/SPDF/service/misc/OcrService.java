package stirling.software.SPDF.service.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;

public interface OcrService {

    ResponseEntity<Resource> processPdfWithOCR(ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException;
}
