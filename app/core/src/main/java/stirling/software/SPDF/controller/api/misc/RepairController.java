package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.service.misc.RepairService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class RepairController {

    private final RepairService repairService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/repair",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript (primary), "
                            + "qpdf (fallback), or PDFBox (if no external tools available). The PDF is"
                            + " first saved to a temporary location, repaired, read back, and then"
                            + " returned as a response. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> repairPdf(@ModelAttribute PDFFile file)
            throws IOException, InterruptedException {

        return repairService.repairPdf(file);
    }
}
