package stirling.software.proprietary.controller.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * Controller to handle OAuth2 callback routing. Returns an HTML page that preserves the URL
 * fragment (which contains the JWT token) and redirects to the frontend.
 */
@Controller
public class ReactRoutingController {

    @Value("${frontend.dev.url:http://localhost:5173}")
    private String frontendDevUrl;

    @Value("${app.dev.mode:true}")
    private boolean devMode;

    /**
     * Handle /auth/callback by returning HTML that preserves the fragment and redirects to the
     * frontend.
     */
    @GetMapping(value = "/auth/callback", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    public String handleAuthCallback() {
        String targetUrl = devMode ? frontendDevUrl : "";
        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <title>OAuth Callback</title>
                    <script>
                        // Preserve the URL fragment and redirect to the frontend
                        var targetUrl = '%s';
                        var fragment = window.location.hash;
                        if (targetUrl) {
                            // Development mode - redirect to Vite dev server
                            window.location.replace(targetUrl + '/auth/callback' + fragment);
                        } else {
                            // Production mode - redirect to React route
                            window.location.replace('/#/auth/callback' + fragment);
                        }
                    </script>
                </head>
                <body>
                    <div style="text-align: center; margin-top: 50px;">
                        <p>Completing authentication...</p>
                        <p>If you are not redirected automatically, <a href="%s">click here</a>.</p>
                    </div>
                </body>
                </html>
                """
                .formatted(targetUrl, targetUrl.isEmpty() ? "/" : targetUrl);
    }
}
