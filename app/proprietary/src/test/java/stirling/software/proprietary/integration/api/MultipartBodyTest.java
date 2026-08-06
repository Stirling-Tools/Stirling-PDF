package stirling.software.proprietary.integration.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The name/value asymmetry here is easy to get wrong in either direction: too lax on names is
 * header injection, too strict on values silently rejects ordinary JSON.
 */
class MultipartBodyTest {

    private static String render(MultipartBody body) throws IOException {
        // The publisher is what actually goes on the wire.
        java.net.http.HttpRequest.BodyPublisher publisher = body.build();
        StringBuilder out = new StringBuilder();
        publisher.subscribe(
                new java.util.concurrent.Flow.Subscriber<>() {
                    @Override
                    public void onSubscribe(java.util.concurrent.Flow.Subscription s) {
                        s.request(Long.MAX_VALUE);
                    }

                    @Override
                    public void onNext(java.nio.ByteBuffer item) {
                        byte[] bytes = new byte[item.remaining()];
                        item.get(bytes);
                        out.append(new String(bytes, StandardCharsets.UTF_8));
                    }

                    @Override
                    public void onError(Throwable t) {}

                    @Override
                    public void onComplete() {}
                });
        return out.toString();
    }

    @Test
    void carriesAJsonValueThroughUntouched() throws IOException {
        // Regression: values were once checked like headers, which rejected every JSON value —
        // including the auto-populated context, so includeContext could never be sent.
        String json = "{\"document\":{\"title\":\"Q3 \\\"final\\\"\"},\"n\":2}";
        MultipartBody body = new MultipartBody();
        body.addField("stirlingContext", json);

        assertThat(render(body)).contains(json);
    }

    @Test
    void carriesAValueWithNewlinesAndBackslashes() throws IOException {
        MultipartBody body = new MultipartBody();
        body.addField("notes", "line one\nline two\\end");

        assertThat(render(body)).contains("line one\nline two\\end");
    }

    @Test
    void writesTheDocumentUnderItsFieldNameAndFilename() throws IOException {
        MultipartBody body = new MultipartBody();
        body.addFields(Map.of("policy", "strict"));
        body.addFile(
                "file",
                "claim.pdf",
                "application/pdf",
                "%PDF-1.7".getBytes(StandardCharsets.UTF_8));

        String rendered = render(body);
        assertThat(rendered).contains("name=\"policy\"").contains("strict");
        assertThat(rendered)
                .contains("name=\"file\"; filename=\"claim.pdf\"")
                .contains("Content-Type: application/pdf")
                .contains("%PDF-1.7");
        assertThat(body.contentType()).startsWith("multipart/form-data; boundary=StirlingBoundary");
    }

    @ParameterizedTest
    @ValueSource(strings = {"na\"me", "na\rme", "na\nme", "na\\me"})
    void refusesAFieldNameThatCouldForgeItsOwnHeaders(String name) {
        MultipartBody body = new MultipartBody();

        assertThatThrownBy(() -> body.addField(name, "v"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("illegal character");
    }

    @ParameterizedTest
    @ValueSource(strings = {"a\".pdf", "a\r.pdf", "a\n.pdf"})
    void refusesAFilenameThatCouldForgeItsOwnHeaders(String filename) {
        MultipartBody body = new MultipartBody();

        assertThatThrownBy(() -> body.addFile("file", filename, "application/pdf", new byte[] {1}))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("illegal character");
    }

    @Test
    void eachBodyGetsItsOwnBoundary() {
        // A value cannot end its own part because it cannot know the boundary in advance.
        assertThat(new MultipartBody().contentType())
                .isNotEqualTo(new MultipartBody().contentType());
    }
}
