package stirling.software.proprietary.pdf.ua;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.junit.jupiter.api.Test;

class StructureTypesWalkTest {

    @Test
    void repeatedAndCyclicElementsAreWalkedOnce() throws Exception {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PDStructureTreeRoot root = new PDStructureTreeRoot();
            document.getDocumentCatalog().setStructureTreeRoot(root);
            PDStructureElement section = new PDStructureElement("Sect", root);
            root.appendKid(section);
            PDStructureElement table = new PDStructureElement("Table", section);
            for (int i = 0; i < 3; i++) {
                section.appendKid(table);
            }
            section.appendKid(section);

            Set<String> types =
                    assertTimeoutPreemptively(
                            Duration.ofSeconds(10), () -> PdfUaTagger.structureTypes(document));
            SourceFacts facts = SourceFacts.of(document);

            assertThat(types).containsExactlyInAnyOrder("Sect", "Table");
            assertThat(facts.structureTypes()).isEqualTo(types);
        }
    }
}
