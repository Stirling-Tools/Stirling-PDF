package stirling.software.SPDF.service.xfa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("SomPath")
class SomPathTest {

    @Test
    @DisplayName("splits on unescaped dots only, so a dotted name stays one token")
    void escapedDotStaysInTheName() {
        SomPath path = SomPath.parse("form1[0].Pagina2[0].seccion\\.f[0].F_12[0]");

        assertThat(path.tokens())
                .extracting(SomPath.Token::name)
                .containsExactly("form1", "Pagina2", "seccion.f", "F_12");
    }

    @Test
    @DisplayName("reads indices, defaults a missing one to 0 and marks class tokens")
    void indicesAndClassTokens() {
        SomPath path = SomPath.parse("form1[0].#pageSet[0].Master[1].Ref");

        assertThat(path.tokens())
                .extracting(SomPath.Token::name, SomPath.Token::index, SomPath.Token::classToken)
                .containsExactly(
                        tuple("form1", 0, false),
                        tuple("pageSet", 0, true),
                        tuple("Master", 1, false),
                        tuple("Ref", 0, false));
    }

    @Test
    @DisplayName("prints back the escaped form it parsed")
    void roundTrips() {
        String name = "form1[0].Pagina1[0].seccion\\.a[0].A_1[0]";

        assertThat(SomPath.parse(name)).hasToString(name);
    }
}
