package stirling.software.proprietary.integration.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

/**
 * Builds a {@code multipart/form-data} body for the JDK HTTP client, which has no multipart
 * publisher of its own.
 *
 * <p>The body is assembled in memory. Callers bound the document size before getting here; the
 * external-API step is for API-shaped payloads, not bulk transfer.
 */
final class MultipartBody {

    private final String boundary;
    private final ByteArrayOutputStream out = new ByteArrayOutputStream();

    MultipartBody() {
        byte[] random = new byte[16];
        new SecureRandom().nextBytes(random);
        this.boundary =
                "StirlingBoundary" + Base64.getUrlEncoder().withoutPadding().encodeToString(random);
    }

    String contentType() {
        return "multipart/form-data; boundary=" + boundary;
    }

    /**
     * @throws IllegalArgumentException if the <em>name</em> could break out of its part header;
     *     names come from step parameters, so they are checked rather than trusted
     */
    MultipartBody addField(String name, String value) throws IOException {
        requireSafe(name, "field name");
        writeAscii("--" + boundary + "\r\n");
        writeAscii("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        // The value is body, not header: quotes, newlines and backslashes are ordinary data here
        // and must survive untouched. Checking it like a header rejected every JSON value - which
        // is most of them, the auto-populated context included.
        out.write(value.getBytes(StandardCharsets.UTF_8));
        writeAscii("\r\n");
        return this;
    }

    MultipartBody addFile(String name, String filename, String contentType, byte[] content)
            throws IOException {
        requireSafe(name, "file field name");
        requireSafe(filename, "filename");
        writeAscii("--" + boundary + "\r\n");
        writeAscii(
                "Content-Disposition: form-data; name=\""
                        + name
                        + "\"; filename=\""
                        + filename
                        + "\"\r\n");
        writeAscii("Content-Type: " + contentType + "\r\n\r\n");
        out.write(content);
        writeAscii("\r\n");
        return this;
    }

    HttpRequest.BodyPublisher build() throws IOException {
        writeAscii("--" + boundary + "--\r\n");
        return HttpRequest.BodyPublishers.ofByteArray(out.toByteArray());
    }

    MultipartBody addFields(Map<String, String> fields) throws IOException {
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            addField(entry.getKey(), entry.getValue());
        }
        return this;
    }

    /**
     * A quote, CR, LF or backslash in a <em>part header</em> - a field name or filename - would let
     * it close the quoted string and forge headers of its own. Values are not checked: they are
     * body, and the boundary that delimits them is 16 random bytes minted per request, so a value
     * cannot end its own part.
     */
    private static void requireSafe(String value, String what) {
        if (value == null) {
            throw new IllegalArgumentException("api step " + what + " must not be null");
        }
        if (value.indexOf('"') >= 0
                || value.indexOf('\r') >= 0
                || value.indexOf('\n') >= 0
                || value.indexOf('\\') >= 0) {
            throw new IllegalArgumentException(
                    "api step " + what + " contains an illegal character: " + value);
        }
    }

    private void writeAscii(String text) throws IOException {
        out.write(text.getBytes(StandardCharsets.UTF_8));
    }
}
