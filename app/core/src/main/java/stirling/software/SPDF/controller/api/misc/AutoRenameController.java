package stirling.software.SPDF.controller.api.misc;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.ExtractHeaderRequest;
import stirling.software.SPDF.service.misc.AutoRenameService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AutoRenameController {

    private final AutoRenameService autoRenameService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/auto-rename",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @Operation(
            summary = "Extract header from PDF file",
            description =
                    "This endpoint accepts a PDF file and attempts to extract its title or header"
                            + " based on heuristics. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> extractHeader(@ModelAttribute ExtractHeaderRequest request)
            throws Exception {

        return autoRenameService.extractHeader(request);
    }
}
