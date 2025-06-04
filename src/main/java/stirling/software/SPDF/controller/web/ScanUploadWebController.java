package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Web controller for the scan-upload functionality.
 */
@Controller
@Tag(name = "Scan Upload", description = "Scan Upload Web Interface")
@Slf4j
@RequiredArgsConstructor
public class ScanUploadWebController {

    /**
     * Serves the scan-upload page for desktop/PC view.
     *
     * @param model the Spring MVC model
     * @return the template name to render
     */
    @GetMapping("/scan-upload")
    @Hidden
    public String scanUploadForm(Model model) {
        model.addAttribute("currentPage", "scan-upload");
        return "misc/scan-upload";
    }

    /**
     * Serves the mobile page for camera capture and upload.
     *
     * @param model the Spring MVC model
     * @param session the session ID parameter
     * @return the template name to render
     */
    @GetMapping("/mobile")
    @Hidden
    public String mobileView(Model model, @RequestParam(name = "session", required = false) String session) {
        model.addAttribute("sessionId", session);
        return "misc/mobile";
    }
}