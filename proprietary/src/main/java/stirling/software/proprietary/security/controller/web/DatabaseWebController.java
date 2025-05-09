<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/controller/web/DatabaseWebController.java
package stirling.software.proprietary.security.controller.web;
========
package stirling.software.enterprise.security.controller.web;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/controller/web/DatabaseWebController.java

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.FileInfo;
<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/controller/web/DatabaseWebController.java
import stirling.software.proprietary.security.service.DatabaseService;
========
import stirling.software.enterprise.security.service.DatabaseService;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/controller/web/DatabaseWebController.java

@Controller
@Tag(name = "Database Management", description = "Database management and security APIs")
@RequiredArgsConstructor
public class DatabaseWebController {

    private final DatabaseService databaseService;

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
        String dbVersion = databaseService.getH2Version();
        model.addAttribute("databaseVersion", dbVersion);
        if ("Unknown".equalsIgnoreCase(dbVersion)) {
            model.addAttribute("infoMessage", "notSupported");
        }
        return "database";
    }
}
