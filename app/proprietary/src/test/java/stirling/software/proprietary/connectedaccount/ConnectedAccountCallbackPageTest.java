package stirling.software.proprietary.connectedaccount;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ConnectedAccountCallbackPageTest {

    @Test
    void escapesTheProviderMessageAndOnlyClosesAPopup() {
        String page =
                ConnectedAccountController.callbackPage(
                        "microsoft",
                        "error",
                        "<script>alert(1)</script>",
                        "https://stirling.example/settings/connectedAccounts");

        assertThat(page).doesNotContain("<script>alert(1)</script>");
        assertThat(page).contains("&lt;script&gt;alert(1)&lt;/script&gt;");
        assertThat(page).contains("href=\"https://stirling.example/settings/connectedAccounts\"");
        assertThat(page).doesNotContain("window.close");
    }

    @Test
    void aConnectedPopupClosesItselfButOnlyWhenItHasAnOpener() {
        String page =
                ConnectedAccountController.callbackPage(
                        "google", "connected", "Connected pat@gmail.com", "/settings");

        int opener = page.indexOf("if(window.opener){");
        int close = page.indexOf("window.close()");
        assertThat(opener).isPositive();
        assertThat(close).isGreaterThan(opener);
        assertThat(page).contains("\"provider\":\"google\"").contains("\"status\":\"connected\"");
    }

    @Test
    void anUntrustedProviderSegmentCannotBreakOutOfTheScript() {
        String page =
                ConnectedAccountController.callbackPage(
                        "x\"});alert(1);//", "connected", "ok", "/settings");

        assertThat(page).doesNotContain("alert(1)");
    }
}
