// package stirling.software.SPDF.config.fingerprint;
//
// import java.io.IOException;
//
// import org.springframework.beans.factory.annotation.Autowired;
// import org.springframework.stereotype.Component;
// import org.springframework.web.filter.OncePerRequestFilter;
//
// import jakarta.servlet.FilterChain;
// import jakarta.servlet.ServletException;
// import jakarta.servlet.http.HttpServletRequest;
// import jakarta.servlet.http.HttpServletResponse;
// import jakarta.servlet.http.HttpSession;
// import lombok.extern.slf4j.Slf4j;
// import stirling.software.SPDF.utils.RequestUriUtils;
//
//// @Component
// @Slf4j
// public class FingerprintBasedSessionFilter extends OncePerRequestFilter {
//    private final FingerprintGenerator fingerprintGenerator;
//    private final FingerprintBasedSessionManager sessionManager;
//
//    @Autowired
//    public FingerprintBasedSessionFilter(
//            FingerprintGenerator fingerprintGenerator,
//            FingerprintBasedSessionManager sessionManager) {
//        this.fingerprintGenerator = fingerprintGenerator;
//        this.sessionManager = sessionManager;
//    }
//
//    @Override
//    protected void doFilterInternal(
//            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
//            throws ServletException, IOException {
//
//        if (RequestUriUtils.isStaticResource(request.getContextPath(), request.getRequestURI())) {
//            filterChain.doFilter(request, response);
//            return;
//        }
//
//        String fingerprint = fingerprintGenerator.generateFingerprint(request);
//        log.debug("Generated fingerprint for request: {}", fingerprint);
//
//        HttpSession session = request.getSession();
//        boolean isNewSession = session.isNew();
//        String sessionId = session.getId();
//
//        if (isNewSession) {
//            log.info("New session created: {}", sessionId);
//        }
//
//        if (!sessionManager.isFingerPrintAllowed(fingerprint)) {
//            log.info("Blocked fingerprint detected, redirecting: {}", fingerprint);
//            response.sendRedirect(request.getContextPath() + "/too-many-requests");
//            return;
//        }
//
//        session.setAttribute("userFingerprint", fingerprint);
//        session.setAttribute(
//                FingerprintBasedSessionManager.STARTUP_TIMESTAMP,
//                FingerprintBasedSessionManager.APP_STARTUP_TIME);
//
//        sessionManager.registerFingerprint(fingerprint, sessionId);
//
//        log.debug("Proceeding with request: {}", request.getRequestURI());
//        filterChain.doFilter(request, response);
//    }
// }
