package stirling.software.SPDF.config.anonymus.session;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.interfaces.SessionsModelInterface;

@Controller
@Slf4j
public class AnonymusSessionStatusController {

    @Autowired private AnonymusSessionListener sessionRegistry;

    @GetMapping("/userSession")
    public String getUserSessions(HttpServletRequest request, Model model) {
        HttpSession session = request.getSession(false);
        if (session != null) {

            boolean isSessionValid =
                    sessionRegistry.getAllNonExpiredSessions().stream()
                            .allMatch(
                                    sessionEntity ->
                                            sessionEntity.getSessionId().equals(session.getId()));

            // Get all sessions for the user
            List<SessionsModelInterface> sessionList =
                    sessionRegistry.getAllNonExpiredSessions().stream()
                            .filter(
                                    sessionEntity ->
                                            !sessionEntity.getSessionId().equals(session.getId()))
                            .toList();

            model.addAttribute("sessionList", sessionList);
            return "userSession";
        }
        return "redirect:/";
    }

    @GetMapping("/userSession/invalidate/{sessionId}")
    public String invalidateUserSession(
            HttpServletRequest request, @PathVariable String sessionId) {
        sessionRegistry.expireSession(sessionId);
        sessionRegistry.registerSession(request.getSession(false));
        return "redirect:/userSession";
    }
}
