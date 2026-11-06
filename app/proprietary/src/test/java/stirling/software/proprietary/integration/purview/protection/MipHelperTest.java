package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@DisabledOnOs(OS.WINDOWS)
class MipHelperTest {

    @TempDir Path dir;

    private MipHelper helperRunning(String script) throws IOException {
        return new MipHelper(FakeMipHelper.propertiesRunning(dir, script));
    }

    @Test
    void answersTokenRequestsAndReturnsTheResult() throws IOException {
        MipHelper helper =
                helperRunning(
                        """
                        echo 'starting up'
                        echo '{"type":"token_request","authority":"https://login.microsoftonline.com/t","resource":"https://aadrm.com/","scope":"","claims":""}'
                        read reply
                        printf '{"type":"result","op":"%s","reply":"%s"}\\n' "$1" "$reply"
                        """);
        List<String> scopes = new ArrayList<>();

        JsonNode result =
                helper.run(
                        "inspect",
                        Map.of("input", "/tmp/x.pdf"),
                        scope -> {
                            scopes.add(scope);
                            return "token-123";
                        });

        assertThat(scopes).containsExactly("https://aadrm.com/.default");
        assertThat(result.get("op").asString()).isEqualTo("inspect");
        assertThat(result.get("reply").asString()).isEqualTo("OK token-123");
    }

    @Test
    void reportsATokenFailureToTheHelperInsteadOfAbandoningIt() throws IOException {
        MipHelper helper =
                helperRunning(
                        """
                        echo '{"type":"token_request","resource":"https://syncservice.o365syncservice.com","scope":""}'
                        read reply
                        printf '{"type":"error","code":"sign_in_required","message":"%s"}\\n' "$reply"
                        exit 1
                        """);

        assertThatThrownBy(
                        () ->
                                helper.run(
                                        "decrypt",
                                        Map.of(),
                                        scope -> {
                                            throw new IOException("consent\nmissing");
                                        }))
                .isInstanceOfSatisfying(
                        RightsManagementException.class,
                        e -> {
                            assertThat(e.getCode()).isEqualTo("sign_in_required");
                            assertThat(e.getMessage()).isEqualTo("ERR consent missing");
                        });
    }

    @Test
    void surfacesTheDocumentOwnerWhenTheUserHasNoRights() throws IOException {
        MipHelper helper =
                helperRunning(
                        """
                        echo '{"type":"error","code":"no_permissions","message":"denied","owner":"alice@contoso.com"}'
                        exit 1
                        """);

        assertThatThrownBy(() -> helper.run("decrypt", Map.of(), scope -> "t"))
                .isInstanceOfSatisfying(
                        RightsManagementException.class,
                        e -> {
                            assertThat(e.getCode()).isEqualTo("no_permissions");
                            assertThat(e.getOwner()).isEqualTo("alice@contoso.com");
                        });
    }

    @Test
    void failsClearlyWhenTheHelperDiesWithoutAnswering() throws IOException {
        MipHelper helper = helperRunning("echo 'libmip_core.so: cannot open' >&2\nexit 127\n");

        assertThatThrownBy(() -> helper.run("inspect", Map.of(), scope -> "t"))
                .isInstanceOf(RightsManagementException.class)
                .hasMessageContaining("exited without a result")
                .hasMessageNotContaining("libmip_core.so");
    }

    @Test
    void isUnavailableWhenNoHelperIsInstalled() {
        MipHelper helper =
                new MipHelper(FakeMipHelper.propertiesWithHelperAt(dir.resolve("missing")));

        assertThat(helper.available()).isFalse();
        assertThatThrownBy(() -> helper.run("inspect", Map.of(), scope -> "t"))
                .isInstanceOfSatisfying(
                        RightsManagementException.class,
                        e -> assertThat(e.getCode()).isEqualTo("unavailable"));
    }

    @ParameterizedTest
    @CsvSource({
        "https://aadrm.com, 7148cdae-b3f2-44ef-abef-481ba8a97af3, https://aadrm.com/.default",
        "'', https://syncservice.o365syncservice.com/.default,"
                + " https://syncservice.o365syncservice.com/.default"
    })
    void asksForTheResourceAndFallsBackToAScopeUrl(String resource, String scope, String expected) {
        JsonNode request =
                new ObjectMapper().createObjectNode().put("resource", resource).put("scope", scope);

        assertThat(MipHelper.scopeFor(request)).isEqualTo(expected);
    }
}
