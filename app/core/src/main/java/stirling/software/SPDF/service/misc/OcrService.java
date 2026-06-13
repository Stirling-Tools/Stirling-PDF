package stirling.software.SPDF.service.misc;

import java.io.IOException;

import stirling.software.SPDF.model.api.misc.FileResponseData;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;

public interface OcrService {

    FileResponseData processPdfWithOCR(ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException;
}
