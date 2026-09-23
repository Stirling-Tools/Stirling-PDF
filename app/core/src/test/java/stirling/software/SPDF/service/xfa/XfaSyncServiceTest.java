package stirling.software.SPDF.service.xfa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.service.xfa.XfaSyncReport.Action;
import stirling.software.SPDF.service.xfa.XfaSyncReport.FieldResult;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Note;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Status;
import stirling.software.common.util.FormUtils;

@DisplayName("XfaSyncService")
class XfaSyncServiceTest {

    private final XfaSyncService service = new XfaSyncService();

    private XfaSyncReport sync(PDDocument document, Set<String> changedFields) throws Exception {
        return service.apply(
                document, service.inspect(document), XfaMode.SYNC, XfaEdit.VALUES, changedFields);
    }

    private static FieldResult field(XfaSyncReport report, String name) {
        return report.fields().stream()
                .filter(result -> result.name().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no report entry for " + name));
    }

    private static COSDictionary perms(PDDocument document) {
        return document.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.PERMS);
    }

    private static COSBase xfaEntry(PDDocument document) {
        return document.getDocumentCatalog()
                .getCOSObject()
                .getCOSDictionary(COSName.ACRO_FORM)
                .getDictionaryObject(COSName.XFA);
    }

    @Nested
    @DisplayName("sync")
    class Sync {

        @Test
        @DisplayName("writes every bound AcroForm value into the XFA data, field by field")
        void matchesFieldByField() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                assertThat(report.action()).isEqualTo(Action.SYNCED);
                assertThat(XfaFixtures.dataValues(document))
                        .containsEntry("form1.Nombre", "IMGA S.L.")
                        .containsEntry("form1.Pagina2.F_12", "nuevo F12")
                        .containsEntry("form1.Pagina1.Acepta", "1")
                        .containsEntry("form1.SiNo", "S")
                        .containsEntry("form1.Calidad", "2")
                        .containsEntry("form1.Lengua", "3")
                        .containsEntry("form1.Provincia", "46")
                        .containsEntry("form1.Observaciones", "línea uno\nlínea  dos")
                        .containsEntry("form1.Ref", "REF-2024")
                        .containsEntry("form1.Nuevo", "valor nuevo")
                        .containsEntry("form1.Extra", "extra nuevo");
            }
        }

        @Test
        @DisplayName("reports each field's XFA value before and after")
        void reportsBeforeAndAfter() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                FieldResult nombre = field(report, XfaFixtures.NOMBRE);
                assertThat(nombre.status()).isEqualTo(Status.UPDATED);
                assertThat(nombre.xfaPath()).isEqualTo("form1.Nombre");
                assertThat(nombre.before()).isEqualTo("Nombre viejo");
                assertThat(nombre.after()).isEqualTo("IMGA S.L.");
                assertThat(field(report, XfaFixtures.NUEVO).status()).isEqualTo(Status.CREATED);
                assertThat(field(report, XfaFixtures.NUEVO).before()).isNull();
                assertThat(field(report, XfaFixtures.SIN_DATOS).status()).isEqualTo(Status.UNBOUND);
                assertThat(field(report, XfaFixtures.EXTRA).notes()).contains(Note.FALLBACK);
                assertThat(report.counts().created()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("stores checkbox values from the template items, not the AcroForm state")
        void checkboxUsesTemplateItems() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                FieldResult siNo = field(report, XfaFixtures.SI_NO);
                assertThat(siNo.kind()).isEqualTo("checkbox");
                assertThat(siNo.before()).isEqualTo("N");
                assertThat(siNo.after()).isEqualTo("S");
            }
        }

        @Test
        @DisplayName("maps a radio state index to the matching exclusion-group choice")
        void radioStateIndexPicksTemplateChoice() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                FieldResult lengua = field(report, XfaFixtures.LENGUA);
                assertThat(lengua.after()).isEqualTo("3");
                assertThat(lengua.notes()).contains(Note.POSITIONAL).doesNotContain(Note.MISMATCH);
                assertThat(field(report, XfaFixtures.CALIDAD).after()).isEqualTo("2");
            }
        }

        @Test
        @DisplayName("replaces rich text but keeps the paragraph and span formatting")
        void richTextKeepsFormatting() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                sync(document, Set.of());

                String datasets = XfaFixtures.packet(document, "datasets");
                assertThat(datasets)
                        .contains(
                                "<p style=\"font-weight:bold\"><span style=\"font-size:9pt\">"
                                        + "línea uno</span></p>")
                        .contains("xfa-spacerun:yes")
                        .doesNotContain("texto viejo");
            }
        }

        @Test
        @DisplayName("resolves fields that share one global data node to the edited value")
        void sharedGlobalNodeTakesTheChangedValue() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                assertThat(field(report, XfaFixtures.REF_PAGE_1).status())
                        .isEqualTo(Status.UPDATED);
                assertThat(field(report, XfaFixtures.REF_PAGE_2).status())
                        .isEqualTo(Status.CONFLICT_RESOLVED);
                PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
                assertThat(acroForm.getField(XfaFixtures.REF_PAGE_2).getValueAsString())
                        .isEqualTo("REF-2024");
            }
        }

        @Test
        @DisplayName("leaves an unedited formatted value alone, writes an edited one")
        void formattedFieldsNeedAnEdit() throws Exception {
            try (PDDocument untouched = XfaFixtures.hybrid();
                    PDDocument edited = XfaFixtures.hybrid()) {
                FieldResult skipped = field(sync(untouched, Set.of()), XfaFixtures.IMPORTE);
                FieldResult written =
                        field(sync(edited, Set.of(XfaFixtures.IMPORTE)), XfaFixtures.IMPORTE);

                assertThat(skipped.status()).isEqualTo(Status.SKIPPED_FORMATTED);
                assertThat(XfaFixtures.dataValues(untouched))
                        .containsEntry("form1.Importe", "1234.5");
                assertThat(written.status()).isEqualTo(Status.UPDATED);
                assertThat(XfaFixtures.dataValues(edited))
                        .containsEntry("form1.Importe", "1.234,50");
            }
        }

        @Test
        @DisplayName("treats a field the operation changed as edited")
        void operationChangesCountAsEdits() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report =
                        service.process(
                                document,
                                XfaMode.SYNC,
                                XfaEdit.VALUES,
                                changed ->
                                        FormUtils.applyFieldValues(
                                                changed,
                                                Map.of(XfaFixtures.IMPORTE, "2.000,00"),
                                                false));

                assertThat(field(report, XfaFixtures.IMPORTE).status()).isEqualTo(Status.UPDATED);
                assertThat(XfaFixtures.dataValues(document))
                        .containsEntry("form1.Importe", "2.000,00");
            }
        }

        @Test
        @DisplayName("never reports the value of a password field")
        void passwordValuesStayOutOfTheReport() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                FieldResult clave = field(sync(document, Set.of()), XfaFixtures.CLAVE);

                assertThat(clave.status()).isEqualTo(Status.SKIPPED_TYPE);
                assertThat(clave.acroForm()).isNull();
                assertThat(clave.before()).isNull();
                assertThat(clave.after()).isNull();
                assertThat(XfaFixtures.dataValues(document))
                        .containsEntry("form1.Clave", "secreto viejo");
            }
        }

        @Test
        @DisplayName("is idempotent: a second pass changes nothing")
        void secondPassIsANoOp() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                sync(document, Set.of());
                COSStream afterFirst = XfaFixtures.packetStream(document, "datasets");
                String firstText = XfaFixtures.packet(document, "datasets");

                XfaSyncReport second = sync(document, Set.of());

                assertThat(second.fields())
                        .extracting(FieldResult::status)
                        .containsOnly(
                                Status.UNCHANGED,
                                Status.UNBOUND,
                                Status.SKIPPED_TYPE,
                                Status.SKIPPED_FORMATTED);
                assertThat(XfaFixtures.packetStream(document, "datasets")).isSameAs(afterFirst);
                assertThat(XfaFixtures.packet(document, "datasets")).isEqualTo(firstText);
            }
        }
    }

    @Nested
    @DisplayName("packets")
    class Packets {

        @Test
        @DisplayName("rewrites datasets as a new FlateDecode stream and leaves the rest alone")
        void onlyDatasetsIsRewritten() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                COSStream template = XfaFixtures.packetStream(document, "template");
                COSStream config = XfaFixtures.packetStream(document, "config");

                sync(document, Set.of());

                COSStream datasets = XfaFixtures.packetStream(document, "datasets");
                assertThat(datasets.getFilters()).isEqualTo(COSName.FLATE_DECODE);
                assertThat(datasets.containsKey(COSName.DECODE_PARMS)).isFalse();
                assertThat(XfaFixtures.packetStream(document, "template")).isSameAs(template);
                assertThat(XfaFixtures.packetStream(document, "config")).isSameAs(config);
                assertThat(XfaFixtures.packetNames(document))
                        .containsExactly(
                                "xdp:xdp", "config", "template", "datasets", "form", "</xdp:xdp>");
            }
        }

        @Test
        @DisplayName("syncs a single-stream XDP without touching its template text")
        void singleStreamKeepsTemplateBytes() throws Exception {
            try (PDDocument document = XfaFixtures.builder().singleStream().build()) {
                sync(document, Set.of());

                String whole = XfaFixtures.packet(document, "datasets");
                assertThat(whole).contains(XfaFixtures.TEMPLATE).contains(XfaFixtures.CONFIG);
                assertThat(XfaFixtures.dataValues(document))
                        .containsEntry("form1.Nombre", "IMGA S.L.");
            }
        }

        @Test
        @DisplayName("creates a datasets packet before the form packet when there is none")
        void createsMissingDatasets() throws Exception {
            try (PDDocument document = XfaFixtures.builder().datasets(null).build()) {
                XfaSyncReport report = sync(document, Set.of());

                assertThat(XfaFixtures.packetNames(document))
                        .containsExactly(
                                "xdp:xdp", "config", "template", "datasets", "form", "</xdp:xdp>");
                assertThat(XfaFixtures.dataValues(document))
                        .containsEntry("form1.Nombre", "IMGA S.L.")
                        .containsEntry("form1.Pagina1.Acepta", "1")
                        .containsEntry("form1.Calidad", "2");
                assertThat(field(report, XfaFixtures.NOMBRE).status()).isEqualTo(Status.CREATED);
            }
        }

        @Test
        @DisplayName("refuses a datasets packet with a DOCTYPE instead of expanding it")
        void rejectsDoctype() throws Exception {
            String hostile =
                    "<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]>"
                            + "<xfa:datasets xmlns:xfa=\"http://www.xfa.org/schema/xfa-data/1.0/\">"
                            + "<xfa:data><form1><Nombre>&e;</Nombre></form1></xfa:data>"
                            + "</xfa:datasets>";
            try (PDDocument document = XfaFixtures.builder().datasets(hostile).build()) {
                assertThatThrownBy(() -> sync(document, Set.of()))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining("xfaMode=strip");
            }
        }

        @Test
        @DisplayName("keeps a PDF that reopens, parses its XFA and renders")
        void savedDocumentStillOpens() throws Exception {
            byte[] saved;
            Map<String, String> synced;
            try (PDDocument document = XfaFixtures.hybrid()) {
                sync(document, Set.of());
                synced = XfaFixtures.dataValues(document);
                saved = XfaFixtures.save(document);
            }

            try (PDDocument reopened = Loader.loadPDF(saved)) {
                assertThat(reopened.getDocumentCatalog().getAcroForm().getXFA().getDocument())
                        .isNotNull();
                assertThat(XfaFixtures.dataValues(reopened)).isEqualTo(synced);
                BufferedImage page = new PDFRenderer(reopened).renderImage(0);
                assertThat(page.getWidth()).isPositive();
            }
        }
    }

    @Nested
    @DisplayName("modes")
    class Modes {

        @Test
        @DisplayName("strip removes the XFA and the usage rights, and keeps the certification")
        void stripRemovesXfa() throws Exception {
            try (PDDocument document = XfaFixtures.builder().needsRendering(false).build()) {
                XfaSyncReport report =
                        service.apply(
                                document,
                                service.inspect(document),
                                XfaMode.STRIP,
                                XfaEdit.VALUES,
                                Set.of());

                assertThat(report.action()).isEqualTo(Action.STRIPPED);
                assertThat(report.usageRightsRemoved()).isTrue();
                assertThat(xfaEntry(document)).isNull();
                assertThat(perms(document).containsKey(COSName.getPDFName("UR3"))).isFalse();
                assertThat(perms(document).containsKey(COSName.getPDFName("DocMDP"))).isTrue();
                assertThat(
                                document.getDocumentCatalog()
                                        .getCOSObject()
                                        .containsKey(COSName.getPDFName("NeedsRendering")))
                        .isFalse();
                assertThat(report.warnings()).anyMatch(warning -> warning.contains("DocMDP"));
                PDTextField nombre =
                        (PDTextField)
                                document.getDocumentCatalog()
                                        .getAcroForm()
                                        .getField(XfaFixtures.NOMBRE);
                assertThat(nombre.getValue()).isEqualTo("IMGA S.L.");
            }
        }

        @Test
        @DisplayName("none leaves the XFA and the usage rights exactly as they were")
        void noneTouchesNothing() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                COSBase xfa = xfaEntry(document);
                String datasets = XfaFixtures.packet(document, "datasets");

                XfaSyncReport report =
                        service.apply(
                                document,
                                service.inspect(document),
                                XfaMode.NONE,
                                XfaEdit.VALUES,
                                Set.of());

                assertThat(report.action()).isEqualTo(Action.UNTOUCHED);
                assertThat(xfaEntry(document)).isSameAs(xfa);
                assertThat(XfaFixtures.packet(document, "datasets")).isEqualTo(datasets);
                assertThat(perms(document).containsKey(COSName.getPDFName("UR3"))).isTrue();
            }
        }

        @Test
        @DisplayName("a structural edit strips the XFA even in sync mode")
        void structuralEditStrips() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report =
                        service.apply(
                                document,
                                service.inspect(document),
                                XfaMode.SYNC,
                                XfaEdit.STRUCTURE,
                                Set.of());

                assertThat(report.action()).isEqualTo(Action.STRIPPED_STRUCTURAL);
                assertThat(xfaEntry(document)).isNull();
            }
        }

        @Test
        @DisplayName("after flattening, removes the usage rights PDFBox leaves behind")
        void flattenCleansUsageRights() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaInspection before = service.inspect(document);
                document.getDocumentCatalog().getAcroForm().flatten();

                XfaSyncReport report =
                        service.apply(document, before, XfaMode.SYNC, XfaEdit.VALUES, Set.of());

                assertThat(report.action()).isEqualTo(Action.REMOVED_BY_FLATTEN);
                assertThat(perms(document).containsKey(COSName.getPDFName("UR3"))).isFalse();
            }
        }

        @Test
        @DisplayName("clears the append-only flag once no signature needs it")
        void clearsStaleAppendOnly() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                sync(document, Set.of());

                assertThat(document.getDocumentCatalog().getAcroForm().isAppendOnly()).isFalse();
            }
        }
    }

    @Nested
    @DisplayName("documents it must not change")
    class Untouchable {

        @Test
        @DisplayName("rejects a dynamic XFA form for sync and strip, lets none through")
        void dynamicFormsOnlyAcrobat() throws Exception {
            try (PDDocument document = XfaFixtures.builder().withoutFields().build()) {
                XfaInspection inspection = service.inspect(document);

                assertThat(inspection.state()).isEqualTo(XfaInspection.State.DYNAMIC);
                assertThatThrownBy(() -> service.requireSupported(inspection, XfaMode.SYNC))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining("Acrobat");
                assertThatThrownBy(() -> service.requireSupported(inspection, XfaMode.STRIP))
                        .isInstanceOf(IllegalArgumentException.class);
                assertThatCode(() -> service.requireSupported(inspection, XfaMode.NONE))
                        .doesNotThrowAnyException();
            }
        }

        @Test
        @DisplayName("treats NeedsRendering as dynamic even when fields exist, as PDFium does")
        void needsRenderingMeansDynamic() throws Exception {
            try (PDDocument document = XfaFixtures.builder().needsRendering(true).build()) {
                assertThat(service.inspect(document).state())
                        .isEqualTo(XfaInspection.State.DYNAMIC);
            }
        }

        @Test
        @DisplayName("changes nothing, usage rights included, in a PDF without XFA")
        void nonXfaDocumentsAreLeftAlone() throws Exception {
            try (PDDocument document = new PDDocument()) {
                document.addPage(new PDPage());
                PDAcroForm acroForm = new PDAcroForm(document);
                document.getDocumentCatalog().setAcroForm(acroForm);
                COSDictionary perms = new COSDictionary();
                perms.setItem(COSName.getPDFName("UR3"), new COSDictionary());
                document.getDocumentCatalog().getCOSObject().setItem(COSName.PERMS, perms);

                XfaSyncReport report = sync(document, Set.of());

                assertThat(report.action()).isEqualTo(Action.NOT_XFA);
                assertThat(report.fields()).isEmpty();
                assertThat(perms(document).containsKey(COSName.getPDFName("UR3"))).isTrue();
            }
        }

        @Test
        @DisplayName("counts nothing but the fields of the XFA form in the report")
        void reportCoversEveryTerminalField() throws Exception {
            try (PDDocument document = XfaFixtures.hybrid()) {
                XfaSyncReport report = sync(document, Set.of());

                List<String> names = report.fields().stream().map(FieldResult::name).toList();
                assertThat(names)
                        .containsExactlyInAnyOrder(
                                XfaFixtures.REF_PAGE_1,
                                XfaFixtures.REF_PAGE_2,
                                XfaFixtures.NOMBRE,
                                XfaFixtures.ACEPTA,
                                XfaFixtures.SI_NO,
                                XfaFixtures.CALIDAD,
                                XfaFixtures.LENGUA,
                                XfaFixtures.OBSERVACIONES,
                                XfaFixtures.PROVINCIA,
                                XfaFixtures.IMPORTE,
                                XfaFixtures.F_12,
                                XfaFixtures.SIN_DATOS,
                                XfaFixtures.NUEVO,
                                XfaFixtures.EXTRA,
                                XfaFixtures.CLAVE);
                COSArray fields =
                        document.getDocumentCatalog()
                                .getCOSObject()
                                .getCOSDictionary(COSName.ACRO_FORM)
                                .getCOSArray(COSName.FIELDS);
                assertThat(fields.size()).isEqualTo(1);
            }
        }
    }
}
