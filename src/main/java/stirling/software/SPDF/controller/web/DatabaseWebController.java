package stirling.software.SPDF.controller.web;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import stirling.software.SPDF.config.security.database.DatabaseService;
import stirling.software.SPDF.utils.FileInfo;

@Controller
@Tag(name = "Database Management", description = "Database management and security APIs")
public class DatabaseWebController {

    private final DatabaseService databaseService;

    public DatabaseWebController(DatabaseService databaseService) {
        this.databaseService = databaseService;
    }

    @PreAuthorize("hasRole('ROLE_ADMIN')")
    @GetMapping("/database")
    public String database(HttpServletRequest request, Model model, Authentication authentication) {
        String error = request.getParameter("error");
        String confirmed = request.getParameter("infoMessage");
        if (error != null) {
            model.addAttribute("error", error);
        } else if (confirmed != null) {
            model.addAttribute("infoMessage", confirmed);
        }
        List<FileInfo> backupList = databaseService.getBackupList();
        model.addAttribute("backupFiles", backupList);
        model.addAttribute("databaseVersion", databaseService.getH2Version());
        if ("Unknown".equalsIgnoreCase(databaseService.getH2Version())) {
            model.addAttribute("infoMessage", "notSupported");
        }
        return "database";
    }
}
