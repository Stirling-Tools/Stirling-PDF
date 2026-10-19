package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OAuthHttpScopeRefusalTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "AADSTS65001: The user or administrator has not consented to use the application",
                "AADSTS70000: The request was denied because one or more scopes requested are"
                        + " unauthorized or expired",
                "AADSTS500011: The resource principal named https://example.com was not found",
                "AADSTS650057: Invalid resource. The client has requested access to a resource"
                        + " which is not listed in the requested permissions"
            })
    void scopeProblemsLeaveTheGrantUsable(String description) {
        assertThat(OAuthHttp.refusesOnlyTheScope(description)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "AADSTS700082: The refresh token has expired due to inactivity",
                "AADSTS50173: The provided grant has expired due to it being revoked",
                "AADSTS650011 is not a scope refusal"
            })
    void revokedGrantsStillNeedTheUserToSignInAgain(String description) {
        assertThat(OAuthHttp.refusesOnlyTheScope(description)).isFalse();
    }
}
