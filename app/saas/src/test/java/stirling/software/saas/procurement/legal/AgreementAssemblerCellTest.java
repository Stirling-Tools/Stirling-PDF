package stirling.software.saas.procurement.legal;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.List;

import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class AgreementAssemblerCellTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "<span style=\"display:none\">Acme</span> Ltd",
                "Acme \\<b>Ltd</b>",
                "Acme \\| Ltd <i>x</i>"
            })
    void buyerValuesRenderAsTextInsideOneCell(String value) throws Exception {
        Method cell = AgreementAssembler.class.getDeclaredMethod("cell", String.class);
        cell.setAccessible(true);
        String markdown =
                "| Term | Value |\n| --- | --- |\n| Name | " + cell.invoke(null, value) + " |\n";

        var extensions = List.of(TablesExtension.create());
        String html =
                HtmlRenderer.builder()
                        .extensions(extensions)
                        .build()
                        .render(Parser.builder().extensions(extensions).build().parse(markdown));

        assertThat(html).doesNotContain("<span").doesNotContain("<b>").doesNotContain("<i>");
        assertThat(html.split("<td>", -1)).hasSize(3);
    }
}
