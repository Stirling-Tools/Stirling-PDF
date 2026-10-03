package stirling.software.SPDF.service.xfa;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilderFactory;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSBoolean;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

/**
 * Builds hybrid AcroForm + XFA documents shaped like the ones Adobe LiveCycle saves: an {@code
 * /XFA} packet array, a template whose data bindings are mostly {@code global}, a dotted subform
 * name that LiveCycle splits across two AcroForm levels, exclusion groups whose widgets are named
 * by position, and a datasets packet whose values have drifted from the AcroForm fields.
 */
public final class XfaFixtures {

    public static final String REF_PAGE_1 = "form1[0].#pageSet[0].Master[0].Ref[0]";
    public static final String REF_PAGE_2 = "form1[0].#pageSet[0].Master[1].Ref[0]";
    public static final String NOMBRE = "form1[0].Pagina1[0].seccion\\.a[0].Nombre[0]";
    public static final String ACEPTA = "form1[0].Pagina1[0].seccion\\.a[0].Acepta[0]";
    public static final String SI_NO = "form1[0].Pagina1[0].seccion\\.a[0].SiNo[0]";
    public static final String CALIDAD = "form1[0].Pagina1[0].Calidad[0]";
    public static final String LENGUA = "form1[0].Pagina1[0].Lengua[0]";
    public static final String OBSERVACIONES = "form1[0].Pagina1[0].Observaciones[0]";
    public static final String PROVINCIA = "form1[0].Pagina1[0].Provincia[0]";
    public static final String IMPORTE = "form1[0].Pagina1[0].Importe[0]";
    public static final String F_12 = "form1[0].Pagina2[0].seccion\\.f[0].F_12[0]";
    public static final String SIN_DATOS = "form1[0].Pagina2[0].SinDatos[0]";
    public static final String NUEVO = "form1[0].Pagina2[0].Nuevo[0]";
    public static final String EXTRA = "form1[0].Pagina2[0].Extra[0]";
    public static final String CLAVE = "form1[0].Pagina2[0].Clave[0]";

    static final String PREAMBLE =
            "<xdp:xdp xmlns:xdp=\"http://ns.adobe.com/xdp/\" timeStamp=\"2024-01-01T00:00:00Z\">";

    static final String CONFIG =
            "<config xmlns=\"http://www.xfa.org/schema/xci/3.0/\"><acrobat><acrobat7>"
                    + "<dynamicRender>forbidden</dynamicRender></acrobat7></acrobat></config>";

    static final String TEMPLATE =
            """
            <template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1">\
            <pageSet><pageArea name="Master"><field name="Ref"><ui><textEdit/></ui>\
            <bind match="global"/></field></pageArea></pageSet>\
            <subform name="Pagina1"><subform name="seccion.a"><bind match="none"/>\
            <field name="Nombre"><ui><textEdit/></ui><bind match="global"/></field>\
            <field name="Acepta"><ui><checkButton/></ui><items><integer>1</integer>\
            <integer>0</integer></items></field>\
            <field name="SiNo"><ui><checkButton/></ui><items><text>S</text><text>N</text></items>\
            <bind match="global"/></field></subform>\
            <exclGroup name="Calidad"><bind match="global"/>\
            <field name="titular"><ui><checkButton/></ui><items><text>1</text></items></field>\
            <field name="contratista"><ui><checkButton/></ui><items><text>2</text></items></field>\
            <field name="ejecutora"><ui><checkButton/></ui><items><text>3</text></items></field>\
            </exclGroup>\
            <exclGroup name="Lengua"><bind match="global"/>\
            <field name="valenciano"><ui><checkButton/></ui><items><text>1</text></items></field>\
            <field name="castellano"><ui><checkButton/></ui><items><text>3</text></items></field>\
            </exclGroup>\
            <field name="Observaciones"><ui><textEdit allowRichText="1"/></ui>\
            <bind match="global"/></field>\
            <field name="Provincia"><ui><choiceList/></ui><items><text>Valencia</text>\
            <text>Alicante</text></items><items save="1"><text>46</text><text>03</text></items>\
            <bind match="global"/></field>\
            <field name="Importe"><ui><numericEdit/></ui><format><picture>num{z.zz9,99}</picture>\
            </format><bind match="global"/></field></subform>\
            <subform name="Pagina2"><subform name="seccion.f"><bind match="none"/>\
            <field name="F_12"><ui><textEdit/></ui></field></subform>\
            <field name="SinDatos"><ui><textEdit/></ui><bind match="none"/></field>\
            <field name="Nuevo"><ui><textEdit/></ui><bind match="global"/></field>\
            <field name="Clave"><ui><passwordEdit/></ui><bind match="global"/></field>\
            </subform></subform></template>""";

    /** Every value here disagrees with the AcroForm fields {@link Builder#build} creates. */
    static final String STALE_DATASETS =
            """
            <xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><form1>\
            <Pagina1><Acepta>0</Acepta></Pagina1><Pagina2><F_12>viejo F12</F_12></Pagina2>\
            <Ref>REF-OLD</Ref><Nombre>Nombre viejo</Nombre><SiNo>N</SiNo><Calidad>3</Calidad>\
            <Lengua/><Observaciones xfa:contentType="text/html"><body \
            xmlns="http://www.w3.org/1999/xhtml"><p style="font-weight:bold"><span \
            style="font-size:9pt">texto viejo</span></p></body></Observaciones>\
            <Provincia>03</Provincia><Importe>1234.5</Importe><Extra>extra viejo</Extra>\
            <Clave>secreto viejo</Clave></form1></xfa:data></xfa:datasets>""";

    static final String FORM_PACKET =
            "<form checksum=\"FD30dwFL4r9oecwjkWpQ6zYmoY4=\""
                    + " xmlns=\"http://www.xfa.org/schema/xfa-form/2.8/\"/>";

    static final String POSTAMBLE = "</xdp:xdp>";

    private XfaFixtures() {}

    public static PDDocument hybrid() throws IOException {
        return builder().build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private boolean singleStream;
        private String template = TEMPLATE;
        private String datasets = STALE_DATASETS;
        private boolean hexEncodedDatasets = true;
        private boolean withFields = true;
        private boolean usageRights = true;
        private boolean certified = true;
        private Boolean needsRendering;

        private Builder() {}

        /** The whole XDP document in one stream instead of a packet array. */
        public Builder singleStream() {
            this.singleStream = true;
            return this;
        }

        public Builder template(String xml) {
            this.template = xml;
            return this;
        }

        /** A datasets packet with this XML, or none at all for null. */
        public Builder datasets(String xml) {
            this.datasets = xml;
            return this;
        }

        public Builder flateDatasets() {
            this.hexEncodedDatasets = false;
            return this;
        }

        /** No AcroForm fields, which is how PDFBox and Stirling recognise a dynamic XFA form. */
        public Builder withoutFields() {
            this.withFields = false;
            return this;
        }

        public Builder withoutUsageRights() {
            this.usageRights = false;
            return this;
        }

        public Builder uncertified() {
            this.certified = false;
            return this;
        }

        public Builder needsRendering(boolean value) {
            this.needsRendering = value;
            return this;
        }

        public PDDocument build() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            COSDictionary form = new COSDictionary();
            document.getDocumentCatalog().getCOSObject().setItem(COSName.ACRO_FORM, form);
            PDResources resources = new PDResources();
            resources.put(
                    COSName.getPDFName("Helv"),
                    new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            form.setItem(COSName.DR, resources.getCOSObject());
            form.setString(COSName.DA, "/Helv 0 Tf 0 g");
            form.setInt(COSName.SIG_FLAGS, 3);
            COSArray fields = new COSArray();
            form.setItem(COSName.FIELDS, fields);
            if (withFields) {
                addFields(document, fields, page);
            }
            form.setItem(COSName.XFA, xfa(document));
            COSDictionary perms = new COSDictionary();
            if (usageRights) {
                perms.setItem(COSName.getPDFName("UR3"), signatureDictionary("UR3"));
            }
            if (certified) {
                perms.setItem(COSName.getPDFName("DocMDP"), signatureDictionary("DocMDP"));
            }
            if (perms.size() > 0) {
                document.getDocumentCatalog().getCOSObject().setItem(COSName.PERMS, perms);
            }
            if (needsRendering != null) {
                document.getDocumentCatalog()
                        .getCOSObject()
                        .setItem(
                                COSName.getPDFName("NeedsRendering"),
                                COSBoolean.getBoolean(needsRendering));
            }
            return document;
        }

        private COSBase xfa(PDDocument document) throws IOException {
            if (singleStream) {
                String whole =
                        PREAMBLE
                                + CONFIG
                                + template
                                + (datasets == null ? "" : datasets)
                                + FORM_PACKET
                                + POSTAMBLE;
                return stream(document, whole, COSName.FLATE_DECODE);
            }
            COSArray packets = new COSArray();
            addPacket(packets, "xdp:xdp", stream(document, PREAMBLE, COSName.FLATE_DECODE));
            addPacket(packets, "config", stream(document, CONFIG, COSName.FLATE_DECODE));
            addPacket(packets, "template", stream(document, template, COSName.FLATE_DECODE));
            if (datasets != null) {
                COSStream packet =
                        stream(
                                document,
                                "\n" + datasets + "\n",
                                hexEncodedDatasets
                                        ? COSName.ASCII_HEX_DECODE
                                        : COSName.FLATE_DECODE);
                if (hexEncodedDatasets) {
                    COSDictionary parameters = new COSDictionary();
                    parameters.setInt(COSName.PREDICTOR, 1);
                    packet.setItem(COSName.DECODE_PARMS, parameters);
                }
                addPacket(packets, "datasets", packet);
            }
            addPacket(packets, "form", stream(document, FORM_PACKET, COSName.FLATE_DECODE));
            addPacket(packets, "</xdp:xdp>", stream(document, POSTAMBLE, COSName.FLATE_DECODE));
            return packets;
        }

        private static void addPacket(COSArray packets, String name, COSStream stream) {
            packets.add(new COSString(name));
            packets.add(stream);
        }

        private static COSDictionary signatureDictionary(String kind) {
            COSDictionary signature = new COSDictionary();
            signature.setItem(COSName.TYPE, COSName.SIG);
            signature.setItem(COSName.FILTER, COSName.getPDFName("Adobe.PPKLite"));
            signature.setString(COSName.NAME, kind);
            return signature;
        }

        /**
         * The AcroForm values every viewer but Acrobat shows. Each one differs from {@link
         * #STALE_DATASETS}, except the second page's copy of the shared Ref field.
         */
        private static void addFields(PDDocument document, COSArray fields, PDPage page)
                throws IOException {
            COSDictionary form1 = group("form1[0]", null);
            fields.add(form1);
            COSDictionary pageSet = group("#pageSet[0]", form1);
            text("Ref[0]", group("Master[0]", pageSet), page, "REF-2024");
            text("Ref[0]", group("Master[1]", pageSet), page, "REF-OLD");

            COSDictionary pagina1 = group("Pagina1[0]", form1);
            COSDictionary seccionA = group("a[0]", group("seccion\\", pagina1));
            text("Nombre[0]", seccionA, page, "IMGA S.L.");
            checkbox(document, "Acepta[0]", seccionA, page, true);
            checkbox(document, "SiNo[0]", seccionA, page, true);
            radio(document, "Calidad[0]", pagina1, page, List.of("1", "2", "3"), 1);
            radio(document, "Lengua[0]", pagina1, page, List.of("1", "3"), 1);
            text("Observaciones[0]", pagina1, page, "línea uno\nlínea  dos");
            COSDictionary provincia = text("Provincia[0]", pagina1, page, "Valencia");
            provincia.setItem(COSName.FT, COSName.CH);
            provincia.setInt(COSName.FF, 1 << 17);
            provincia.setItem(COSName.OPT, COSArray.ofCOSStrings(List.of("Valencia", "Alicante")));
            text("Importe[0]", pagina1, page, "1.234,50");

            COSDictionary pagina2 = group("Pagina2[0]", form1);
            text("F_12[0]", group("f[0]", group("seccion\\", pagina2)), page, "nuevo F12");
            text("SinDatos[0]", pagina2, page, "sin datos");
            text("Nuevo[0]", pagina2, page, "valor nuevo");
            text("Extra[0]", pagina2, page, "extra nuevo");
            COSDictionary clave = text("Clave[0]", pagina2, page, "secreto nuevo");
            clave.setInt(COSName.FF, 1 << 13);
        }
    }

    private static COSDictionary group(String partialName, COSDictionary parent) {
        COSDictionary node = new COSDictionary();
        node.setString(COSName.T, partialName);
        if (parent != null) {
            node.setItem(COSName.PARENT, parent);
            kids(parent).add(node);
        }
        return node;
    }

    private static COSArray kids(COSDictionary parent) {
        COSArray kids = parent.getCOSArray(COSName.KIDS);
        if (kids == null) {
            kids = new COSArray();
            parent.setItem(COSName.KIDS, kids);
        }
        return kids;
    }

    private static COSDictionary text(
            String partialName, COSDictionary parent, PDPage page, String value) {
        COSDictionary field = group(partialName, parent);
        field.setItem(COSName.FT, COSName.TX);
        field.setString(COSName.DA, "/Helv 9 Tf 0 g");
        field.setString(COSName.V, value);
        widget(field, page);
        return field;
    }

    private static void checkbox(
            PDDocument document,
            String partialName,
            COSDictionary parent,
            PDPage page,
            boolean checked)
            throws IOException {
        COSDictionary field = group(partialName, parent);
        field.setItem(COSName.FT, COSName.BTN);
        COSName on = COSName.getPDFName("1");
        field.setItem(COSName.V, checked ? on : COSName.Off);
        widget(field, page);
        field.setItem(COSName.AP, states(document, "1"));
        field.setItem(COSName.AS, checked ? on : COSName.Off);
    }

    /** One widget per choice, with the on-states LiveCycle writes: 0, 1, 2 in template order. */
    private static void radio(
            PDDocument document,
            String partialName,
            COSDictionary parent,
            PDPage page,
            List<String> exportValues,
            int selected)
            throws IOException {
        COSDictionary field = group(partialName, parent);
        field.setItem(COSName.FT, COSName.BTN);
        field.setInt(COSName.FF, (1 << 15) | (1 << 14));
        field.setItem(COSName.OPT, COSArray.ofCOSStrings(exportValues));
        field.setItem(COSName.V, COSName.getPDFName(String.valueOf(selected)));
        for (int i = 0; i < exportValues.size(); i++) {
            COSDictionary widget = new COSDictionary();
            widget.setItem(COSName.PARENT, field);
            kids(field).add(widget);
            annotate(widget, page);
            widget.setItem(COSName.AP, states(document, String.valueOf(i)));
            widget.setItem(
                    COSName.AS,
                    i == selected ? COSName.getPDFName(String.valueOf(i)) : COSName.Off);
        }
    }

    private static COSDictionary states(PDDocument document, String onState) throws IOException {
        COSDictionary normal = new COSDictionary();
        normal.setItem(COSName.getPDFName(onState), stream(document, "", null));
        normal.setItem(COSName.Off, stream(document, "", null));
        COSDictionary appearance = new COSDictionary();
        appearance.setItem(COSName.N, normal);
        return appearance;
    }

    private static void widget(COSDictionary field, PDPage page) {
        annotate(field, page);
    }

    private static void annotate(COSDictionary widget, PDPage page) {
        widget.setItem(COSName.TYPE, COSName.ANNOT);
        widget.setItem(COSName.SUBTYPE, COSName.WIDGET);
        widget.setItem(COSName.RECT, new PDRectangle(50, 700, 200, 16).getCOSArray());
        widget.setItem(COSName.P, page.getCOSObject());
        widget.setInt(COSName.F, 4);
        COSArray annotations = page.getCOSObject().getCOSArray(COSName.ANNOTS);
        if (annotations == null) {
            annotations = new COSArray();
            page.getCOSObject().setItem(COSName.ANNOTS, annotations);
        }
        annotations.add(widget);
    }

    private static COSStream stream(PDDocument document, String content, COSName filter)
            throws IOException {
        COSStream stream = document.getDocument().createCOSStream();
        try (OutputStream out = stream.createOutputStream(filter)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return stream;
    }

    public static byte[] save(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }

    /** The decoded text of a named packet, or of the whole stream for a single-stream XFA. */
    public static String packet(PDDocument document, String name) throws IOException {
        COSDictionary form =
                document.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.ACRO_FORM);
        COSBase xfa = form.getDictionaryObject(COSName.XFA);
        if (xfa instanceof COSStream single) {
            return read(single);
        }
        COSArray packets = (COSArray) xfa;
        for (int i = 0; i < packets.size(); i += 2) {
            if (name.equals(((COSString) packets.getObject(i)).getString())) {
                return read((COSStream) packets.getObject(i + 1));
            }
        }
        return null;
    }

    public static COSStream packetStream(PDDocument document, String name) {
        COSDictionary form =
                document.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.ACRO_FORM);
        COSArray packets = (COSArray) form.getDictionaryObject(COSName.XFA);
        for (int i = 0; i < packets.size(); i += 2) {
            if (name.equals(((COSString) packets.getObject(i)).getString())) {
                return (COSStream) packets.getObject(i + 1);
            }
        }
        return null;
    }

    public static List<String> packetNames(PDDocument document) {
        COSDictionary form =
                document.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.ACRO_FORM);
        COSArray packets = (COSArray) form.getDictionaryObject(COSName.XFA);
        List<String> names = new ArrayList<>();
        for (int i = 0; i < packets.size(); i += 2) {
            names.add(((COSString) packets.getObject(i)).getString());
        }
        return names;
    }

    /**
     * Every data value under the record, keyed by its dot-separated path; a rich-text value reads
     * as its paragraphs joined with line breaks.
     */
    public static Map<String, String> dataValues(PDDocument document) throws Exception {
        String xml = packet(document, "datasets");
        if (xml == null) {
            return Map.of();
        }
        DocumentBuilderFactory factory = DocumentBuilderFactory.newDefaultInstance();
        factory.setNamespaceAware(true);
        Document parsed =
                factory.newDocumentBuilder()
                        .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        Element datasets =
                (Element) parsed.getElementsByTagNameNS(XfaXml.DATA_NS, "datasets").item(0);
        Element data = XfaXml.firstChild(datasets, "data");
        Map<String, String> values = new LinkedHashMap<>();
        for (Element record : XfaXml.childElements(data)) {
            collect(record, "", values);
        }
        return values;
    }

    private static void collect(Element element, String prefix, Map<String, String> into) {
        String path =
                prefix.isEmpty()
                        ? XfaXml.localNameOf(element)
                        : prefix + "." + XfaXml.localNameOf(element);
        List<Element> children = XfaXml.childElements(element);
        Element body = XfaRichText.body(element);
        if (body != null) {
            List<String> lines = new ArrayList<>();
            for (Element paragraph : XfaXml.childElements(body)) {
                lines.add(paragraph.getTextContent());
            }
            into.put(path, String.join("\n", lines));
        } else if (children.isEmpty()) {
            into.put(path, element.getTextContent());
        } else {
            for (Element child : children) {
                if (child.getNodeType() == Node.ELEMENT_NODE) {
                    collect(child, path, into);
                }
            }
        }
    }

    private static String read(COSStream stream) throws IOException {
        try (InputStream in = stream.createInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
