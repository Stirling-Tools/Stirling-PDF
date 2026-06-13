package stirling.software.SPDF.service.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;

import stirling.software.common.model.api.PDFFile;

public interface RepairService {
    ResponseEntity<Resource> repairPdf(PDFFile file) throws IOException, InterruptedException;
}
