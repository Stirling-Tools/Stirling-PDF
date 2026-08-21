package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mockStatic;

import java.io.FileNotFoundException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedStatic;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.model.api.signature.SavedSignatureResponse;

import tools.jackson.databind.ObjectMapper;

/**
 * Tests for {@link SignatureService}. The service resolves its base directory from {@link
 * InstallationPathConfig#getSignaturesPath()} in its constructor, so the constructor is invoked
 * inside a static mock pointing at a {@link TempDir}.
 */
class SignatureServiceTest {

    @TempDir Path tempDir;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private SignatureService service;
    private MockedStatic<InstallationPathConfig> pathMock;

    private static final String USER = "alice";

    @BeforeEach
    void setUp() {
        pathMock = mockStatic(InstallationPathConfig.class);
        pathMock.when(InstallationPathConfig::getSignaturesPath).thenReturn(tempDir.toString());
        service = new SignatureService(objectMapper);
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        pathMock.close();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** 1x1 PNG data URL. */
    private static String pngDataUrl() {
        // Minimal but decodable base64 payload; SignatureService does not parse the image content.
        byte[] bytes = "fake-png-bytes".getBytes(StandardCharsets.UTF_8);
        return "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes);
    }

    private SavedSignatureRequest imageRequest(String id, String scope) {
        SavedSignatureRequest req = new SavedSignatureRequest();
        req.setId(id);
        req.setLabel("My Signature");
        req.setType("image");
        req.setScope(scope);
        req.setDataUrl(pngDataUrl());
        return req;
    }

    private Path userFolder(String user) {
        return tempDir.resolve(user);
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("saveSignature")
    class SaveSignature {

        @Test
        @DisplayName("personal scope writes image + metadata and returns a reference URL")
        void savesPersonalSignature() throws Exception {
            SavedSignatureResponse resp =
                    service.saveSignature(USER, imageRequest("sig1", "personal"));

            assertThat(resp.getId()).isEqualTo("sig1");
            assertThat(resp.getScope()).isEqualTo("personal");
            assertThat(resp.getDataUrl()).isEqualTo("/api/v1/general/signatures/sig1.png");
            assertThat(Files.exists(userFolder(USER).resolve("sig1.png"))).isTrue();
            assertThat(Files.exists(userFolder(USER).resolve("sig1.json"))).isTrue();
        }

        @Test
        @DisplayName("null scope defaults to personal")
        void nullScopeDefaultsToPersonal() throws Exception {
            SavedSignatureRequest req = imageRequest("sig2", null);
            SavedSignatureResponse resp = service.saveSignature(USER, req);

            assertThat(resp.getScope()).isEqualTo("personal");
            assertThat(Files.exists(userFolder(USER).resolve("sig2.png"))).isTrue();
        }

        @Test
        @DisplayName("shared scope writes into the ALL_USERS folder")
        void savesSharedSignature() throws Exception {
            SavedSignatureResponse resp =
                    service.saveSignature(USER, imageRequest("shared1", "shared"));

            assertThat(resp.getScope()).isEqualTo("shared");
            assertThat(Files.exists(tempDir.resolve("ALL_USERS").resolve("shared1.png"))).isTrue();
        }

        @Test
        @DisplayName("text type copies font/colour properties into the response")
        void savesTextSignatureProperties() throws Exception {
            SavedSignatureRequest req = new SavedSignatureRequest();
            req.setId("text1");
            req.setLabel("Typed");
            req.setType("text");
            req.setScope("personal");
            req.setSignerName("Alice A");
            req.setFontFamily("Arial");
            req.setFontSize(18);
            req.setTextColor("#112233");
            // no dataUrl -> only metadata json written

            SavedSignatureResponse resp = service.saveSignature(USER, req);

            assertThat(resp.getSignerName()).isEqualTo("Alice A");
            assertThat(resp.getFontFamily()).isEqualTo("Arial");
            assertThat(resp.getFontSize()).isEqualTo(18);
            assertThat(resp.getTextColor()).isEqualTo("#112233");
            assertThat(Files.exists(userFolder(USER).resolve("text1.json"))).isTrue();
        }

        @Test
        @DisplayName("rejects an invalid id with path traversal characters")
        void rejectsInvalidId() {
            SavedSignatureRequest req = imageRequest("../evil", "personal");
            assertThatThrownBy(() -> service.saveSignature(USER, req))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Invalid filename");
        }

        @Test
        @DisplayName("rejects a data URL whose decoded image exceeds the per-signature limit")
        void rejectsOversizedImage() {
            // > 2MB of base64 decodes to > 2MB raw, tripping the decoded-size guard
            byte[] big = new byte[2_100_000];
            String dataUrl = "data:image/png;base64," + Base64.getEncoder().encodeToString(big);
            SavedSignatureRequest req = new SavedSignatureRequest();
            req.setId("toolarge");
            req.setType("image");
            req.setScope("personal");
            req.setDataUrl(dataUrl);

            assertThatThrownBy(() -> service.saveSignature(USER, req))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("too large");
        }

        @Test
        @DisplayName("rejects an unsupported image extension from the data URL mime type")
        void rejectsUnsupportedExtension() {
            byte[] bytes = "gif-bytes".getBytes(StandardCharsets.UTF_8);
            String dataUrl = "data:image/gif;base64," + Base64.getEncoder().encodeToString(bytes);
            SavedSignatureRequest req = new SavedSignatureRequest();
            req.setId("gifsig");
            req.setType("image");
            req.setScope("personal");
            req.setDataUrl(dataUrl);

            assertThatThrownBy(() -> service.saveSignature(USER, req))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Unsupported image extension");
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("getPersonalSignatureBytes")
    class GetPersonalSignatureBytes {

        @Test
        @DisplayName("returns the stored image bytes")
        void returnsStoredBytes() throws Exception {
            service.saveSignature(USER, imageRequest("sig1", "personal"));

            byte[] bytes = service.getPersonalSignatureBytes(USER, "sig1.png");

            assertThat(bytes).isNotEmpty();
        }

        @Test
        @DisplayName("throws FileNotFoundException when the personal signature is missing")
        void throwsWhenMissing() {
            assertThatThrownBy(() -> service.getPersonalSignatureBytes(USER, "missing.png"))
                    .isInstanceOf(FileNotFoundException.class)
                    .hasMessageContaining("not found");
        }

        @Test
        @DisplayName("rejects a filename with invalid characters")
        void rejectsInvalidFilename() {
            assertThatThrownBy(() -> service.getPersonalSignatureBytes(USER, "bad name!.png"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("invalid characters");
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("getSavedSignatures")
    class GetSavedSignatures {

        @Test
        @DisplayName("returns personal and shared signatures combined")
        void returnsPersonalAndShared() throws Exception {
            service.saveSignature(USER, imageRequest("p1", "personal"));
            service.saveSignature(USER, imageRequest("s1", "shared"));

            List<SavedSignatureResponse> all = service.getSavedSignatures(USER);

            assertThat(all).extracting(SavedSignatureResponse::getId).contains("p1", "s1");
            assertThat(all)
                    .extracting(SavedSignatureResponse::getScope)
                    .contains("personal", "shared");
        }

        @Test
        @DisplayName("returns an empty list when the user has no folder")
        void emptyWhenNoFolder() throws Exception {
            List<SavedSignatureResponse> all = service.getSavedSignatures("nobody");
            assertThat(all).isEmpty();
        }

        @Test
        @DisplayName("falls back to file metadata for legacy images without a json sidecar")
        void fallbackForLegacyImage() throws Exception {
            Path folder = userFolder(USER);
            Files.createDirectories(folder);
            Files.write(folder.resolve("legacy.png"), "img".getBytes(StandardCharsets.UTF_8));

            List<SavedSignatureResponse> all = service.getSavedSignatures(USER);

            assertThat(all).hasSize(1);
            SavedSignatureResponse sig = all.get(0);
            assertThat(sig.getId()).isEqualTo("legacy");
            assertThat(sig.getType()).isEqualTo("image");
            assertThat(sig.getDataUrl()).isEqualTo("/api/v1/general/signatures/legacy.png");
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("deleteSignature")
    class DeleteSignature {

        @Test
        @DisplayName("deletes both the image and its metadata from the personal folder")
        void deletesImageAndMetadata() throws Exception {
            service.saveSignature(USER, imageRequest("sig1", "personal"));

            service.deleteSignature(USER, "sig1");

            assertThat(Files.exists(userFolder(USER).resolve("sig1.png"))).isFalse();
            assertThat(Files.exists(userFolder(USER).resolve("sig1.json"))).isFalse();
        }

        @Test
        @DisplayName("throws when the signature cannot be found")
        void throwsWhenNotFound() throws Exception {
            // user folder exists but no matching files
            Files.createDirectories(userFolder(USER));
            assertThatThrownBy(() -> service.deleteSignature(USER, "ghost"))
                    .isInstanceOf(FileNotFoundException.class)
                    .hasMessageContaining("cannot be deleted");
        }

        @Test
        @DisplayName("rejects an invalid signature id")
        void rejectsInvalidId() {
            assertThatThrownBy(() -> service.deleteSignature(USER, "../x"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("updateSignatureLabel")
    class UpdateSignatureLabel {

        @Test
        @DisplayName("updates the label of a personal signature")
        void updatesPersonalLabel() throws Exception {
            service.saveSignature(USER, imageRequest("sig1", "personal"));

            service.updateSignatureLabel(USER, "sig1", "Renamed");

            String json =
                    Files.readString(userFolder(USER).resolve("sig1.json"), StandardCharsets.UTF_8);
            SavedSignatureResponse updated =
                    objectMapper.readValue(json, SavedSignatureResponse.class);
            assertThat(updated.getLabel()).isEqualTo("Renamed");
        }

        @Test
        @DisplayName("updates the label of a shared signature when no personal one exists")
        void updatesSharedLabel() throws Exception {
            service.saveSignature(USER, imageRequest("sh1", "shared"));

            service.updateSignatureLabel(USER, "sh1", "SharedRenamed");

            String json =
                    Files.readString(
                            tempDir.resolve("ALL_USERS").resolve("sh1.json"),
                            StandardCharsets.UTF_8);
            SavedSignatureResponse updated =
                    objectMapper.readValue(json, SavedSignatureResponse.class);
            assertThat(updated.getLabel()).isEqualTo("SharedRenamed");
        }

        @Test
        @DisplayName("throws when no metadata file exists in either folder")
        void throwsWhenMetadataMissing() {
            assertThatThrownBy(() -> service.updateSignatureLabel(USER, "nope", "x"))
                    .isInstanceOf(FileNotFoundException.class)
                    .hasMessageContaining("metadata not found");
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("isSharedSignature")
    class IsSharedSignature {

        @Test
        @DisplayName("true when a shared metadata file exists")
        void trueWhenShared() throws Exception {
            service.saveSignature(USER, imageRequest("sh1", "shared"));
            assertThat(service.isSharedSignature("sh1")).isTrue();
        }

        @Test
        @DisplayName("false when no shared metadata file exists")
        void falseWhenNotShared() {
            assertThat(service.isSharedSignature("sig1")).isFalse();
        }

        @Test
        @DisplayName("rejects an invalid signature id")
        void rejectsInvalidId() {
            assertThatThrownBy(() -> service.isSharedSignature("../x"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("storage limits")
    class StorageLimits {

        @Test
        @DisplayName("rejects saving once the per-user signature count limit is reached")
        void rejectsWhenCountLimitReached() throws Exception {
            // Pre-create 20 png files to hit MAX_SIGNATURES_PER_USER
            Path folder = userFolder(USER);
            Files.createDirectories(folder);
            for (int i = 0; i < 20; i++) {
                Files.write(folder.resolve("s" + i + ".png"), new byte[] {1});
            }

            SavedSignatureRequest req = imageRequest("overflow", "personal");
            assertThatThrownBy(() -> service.saveSignature(USER, req))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Maximum signatures limit reached");
        }
    }
}
