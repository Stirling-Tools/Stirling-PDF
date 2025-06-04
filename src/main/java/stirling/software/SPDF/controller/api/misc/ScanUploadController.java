package stirling.software.SPDF.controller.api.misc;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

/**
 * Controller for scan upload functionality - WebRTC version.
 * 
 * This controller is completely empty as all functionality has been moved to WebRTC.
 * The image transfer happens directly between browsers without any server involvement.
 */
@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Hidden
@Slf4j
public class ScanUploadController {
    // All functionality has been moved to client-side WebRTC
}