package stirling.software.SPDF.service.xfa;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.service.xfa.XfaTemplate.Match;
import stirling.software.SPDF.service.xfa.XfaTemplate.Step;

@DisplayName("XfaTemplate")
class XfaTemplateTest {

    private static XfaTemplate template(String xml) throws Exception {
        return XfaTemplate.parse(
                XfaXml.parse(xml.getBytes(StandardCharsets.UTF_8), null).getDocumentElement());
    }

    private static List<String> names(List<Step> chain) {
        return chain.stream()
                .map(step -> step.container().name == null ? "#" : step.container().name)
                .toList();
    }

    @Test
    @DisplayName("resolves a dotted subform name LiveCycle split across two AcroForm levels")
    void dottedName() throws Exception {
        List<Step> chain =
                template(XfaFixtures.TEMPLATE)
                        .resolve(SomPath.parse(XfaFixtures.F_12))
                        .orElseThrow();

        assertThat(names(chain)).containsExactly("form1", "Pagina2", "seccion.f", "F_12");
    }

    @Test
    @DisplayName("maps both instances of a master page onto its one definition")
    void masterPageInstances() throws Exception {
        List<Step> chain =
                template(XfaFixtures.TEMPLATE)
                        .resolve(SomPath.parse(XfaFixtures.REF_PAGE_2))
                        .orElseThrow();

        assertThat(names(chain)).containsExactly("form1", "#", "Master", "Ref");
        assertThat(chain.get(2).instance()).isEqualTo(1);
        assertThat(chain.getLast().container().match).isEqualTo(Match.GLOBAL);
    }

    @Test
    @DisplayName("tells unnamed subforms apart by their class index")
    void unnamedSubforms() throws Exception {
        XfaTemplate template =
                template(
                        "<template xmlns=\"http://www.xfa.org/schema/xfa-template/3.3/\">"
                                + "<subform name=\"form1\"><subform><field name=\"X\"/></subform>"
                                + "<subform><field name=\"X\"/></subform></subform></template>");

        Step first =
                template.resolve(SomPath.parse("form1[0].#subform[0].X[0]")).orElseThrow().get(1);
        Step second =
                template.resolve(SomPath.parse("form1[0].#subform[1].X[0]")).orElseThrow().get(1);

        assertThat(second.container().ordinal).isGreaterThan(first.container().ordinal);
    }

    @Test
    @DisplayName("finds fields through containers the AcroForm name leaves out")
    void passThroughContainers() throws Exception {
        XfaTemplate template =
                template(
                        "<template xmlns=\"http://www.xfa.org/schema/xfa-template/3.3/\">"
                                + "<subform name=\"form1\"><subformSet><area>"
                                + "<subform name=\"A\"><field name=\"B\"/></subform>"
                                + "</area></subformSet></subform></template>");

        assertThat(template.resolve(SomPath.parse("form1[0].A[0].B[0]"))).isPresent();
    }

    @Test
    @DisplayName("inherits a binding from a prototype through use=\"#id\"")
    void prototypeBinding() throws Exception {
        XfaTemplate template =
                template(
                        "<template xmlns=\"http://www.xfa.org/schema/xfa-template/3.3/\">"
                                + "<subform name=\"form1\"><proto><field id=\"shared\">"
                                + "<bind match=\"global\"/></field></proto>"
                                + "<field name=\"NIF\" use=\"#shared\"/></subform></template>");

        Step field = template.resolve(SomPath.parse("form1[0].NIF[0]")).orElseThrow().getLast();

        assertThat(field.container().match).isEqualTo(Match.GLOBAL);
    }

    @Test
    @DisplayName("finds nothing for a name the template does not hold")
    void unknownName() throws Exception {
        assertThat(
                        template(XfaFixtures.TEMPLATE)
                                .resolve(SomPath.parse("form1[0].Pagina2[0].Extra[0]")))
                .isEmpty();
    }
}
