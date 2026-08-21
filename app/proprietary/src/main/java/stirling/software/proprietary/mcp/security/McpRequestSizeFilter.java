package stirling.software.proprietary.mcp.security;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Caps MCP request body size (via Content-Length and by buffering up to the cap) and rejects
 * oversized bodies with a clean 413 before JSON parsing.
 */
public class McpRequestSizeFilter extends OncePerRequestFilter {

    private final long maxBodyBytes;

    public McpRequestSizeFilter(long maxBodyBytes) {
        this.maxBodyBytes = maxBodyBytes > 0 ? maxBodyBytes : 256L * 1024L;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        long declared = request.getContentLengthLong();
        if (declared > maxBodyBytes) {
            tooLarge(response);
            return;
        }
        byte[] body;
        try {
            body = readUpTo(request.getInputStream(), maxBodyBytes);
        } catch (BodyTooLargeException e) {
            tooLarge(response);
            return;
        }
        filterChain.doFilter(new CachedBodyRequest(request, body), response);
    }

    private static byte[] readUpTo(InputStream in, long max) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(chunk)) != -1) {
            total += n;
            if (total > max) {
                throw new BodyTooLargeException();
            }
            buffer.write(chunk, 0, n);
        }
        return buffer.toByteArray();
    }

    private void tooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setContentType("application/json");
        response.getWriter()
                .write(
                        "{\"error\":\"payload_too_large\",\"message\":\"MCP request body exceeds the"
                                + " configured limit of "
                                + maxBodyBytes
                                + " bytes.\"}");
    }

    private static final class BodyTooLargeException extends IOException {}

    /** Re-serves the buffered body to the controller. */
    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream source = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return source.read();
                }

                @Override
                public int read(byte[] b, int off, int len) {
                    return source.read(b, off, len);
                }

                @Override
                public boolean isFinished() {
                    return source.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                    // Synchronous buffered body; no async reads.
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            String enc = getCharacterEncoding();
            Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
            return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(body), cs));
        }
    }
}
