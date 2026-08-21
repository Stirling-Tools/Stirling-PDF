package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Covers the {@link AmrMethod} enum: every constant's wire value, values(), and valueOf(). */
class AmrMethodTest {

    @Test
    @DisplayName("values() lists every Supabase amr method")
    void valuesListsAllConstants() {
        assertThat(AmrMethod.values())
                .containsExactly(
                        AmrMethod.OAUTH,
                        AmrMethod.PASSWORD,
                        AmrMethod.OTP,
                        AmrMethod.TOTP,
                        AmrMethod.RECOVERY,
                        AmrMethod.INVITE,
                        AmrMethod.SSO_SAML,
                        AmrMethod.MAGICLINK,
                        AmrMethod.EMAIL_SIGNUP,
                        AmrMethod.EMAIL_CHANGE,
                        AmrMethod.TOKEN_REFRESH,
                        AmrMethod.ANONYMOUS);
    }

    @Test
    @DisplayName("getMethod() returns the JWT amr-claim wire value for each constant")
    void getMethodReturnsWireValue() {
        assertThat(AmrMethod.OAUTH.getMethod()).isEqualTo("oauth");
        assertThat(AmrMethod.PASSWORD.getMethod()).isEqualTo("password");
        assertThat(AmrMethod.OTP.getMethod()).isEqualTo("otp");
        assertThat(AmrMethod.TOTP.getMethod()).isEqualTo("totp");
        assertThat(AmrMethod.RECOVERY.getMethod()).isEqualTo("recovery");
        assertThat(AmrMethod.INVITE.getMethod()).isEqualTo("invite");
        assertThat(AmrMethod.SSO_SAML.getMethod()).isEqualTo("sso/saml");
        assertThat(AmrMethod.MAGICLINK.getMethod()).isEqualTo("magiclink");
        assertThat(AmrMethod.EMAIL_SIGNUP.getMethod()).isEqualTo("email/signup");
        assertThat(AmrMethod.EMAIL_CHANGE.getMethod()).isEqualTo("email_change");
        assertThat(AmrMethod.TOKEN_REFRESH.getMethod()).isEqualTo("token_refresh");
        assertThat(AmrMethod.ANONYMOUS.getMethod()).isEqualTo("anonymous");
    }

    @Test
    @DisplayName("valueOf round-trips the constant name")
    void valueOfRoundTrips() {
        for (AmrMethod method : AmrMethod.values()) {
            assertThat(AmrMethod.valueOf(method.name())).isSameAs(method);
        }
    }

    @Test
    @DisplayName("valueOf rejects an unknown name")
    void valueOfRejectsUnknown() {
        assertThatThrownBy(() -> AmrMethod.valueOf("not_a_method"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("every wire value is distinct")
    void wireValuesAreUnique() {
        long distinct =
                java.util.Arrays.stream(AmrMethod.values())
                        .map(AmrMethod::getMethod)
                        .distinct()
                        .count();
        assertThat(distinct).isEqualTo(AmrMethod.values().length);
    }
}
