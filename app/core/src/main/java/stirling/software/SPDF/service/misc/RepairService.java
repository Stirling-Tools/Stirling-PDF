package stirling.software.SPDF.service.misc;

import java.io.IOException;

import stirling.software.SPDF.model.api.misc.FileResponseData;
import stirling.software.common.model.api.PDFFile;

public interface RepairService {
    FileResponseData repairPdf(PDFFile file) throws IOException, InterruptedException;
}
