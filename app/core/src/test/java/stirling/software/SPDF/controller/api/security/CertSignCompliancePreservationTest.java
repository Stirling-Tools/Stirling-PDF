package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDNumberTreeNode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDMarkInfo;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;
import org.verapdf.gf.foundry.VeraGreenfieldFoundryProvider;
import org.verapdf.pdfa.Foundries;
import org.verapdf.pdfa.PDFAParser;
import org.verapdf.pdfa.PDFAValidator;
import org.verapdf.pdfa.flavours.PDFAFlavour;
import org.verapdf.pdfa.results.TestAssertion;
import org.verapdf.pdfa.results.ValidationResult;

import stirling.software.common.service.CustomPDFDocumentFactory;

class CertSignCompliancePreservationTest {

    private static final String TITLE = "Compliance fixture";

    @BeforeAll
    static void initialiseVeraPdf() {
        VeraGreenfieldFoundryProvider.initialise();
    }

    @ParameterizedTest
    @CsvSource({"true,false", "true,true", "false,false"})
    void signatureKeepsPdfa2bAndPdfUa1(boolean showSignature, boolean showLogo) throws Exception {
        byte[] source = buildPdfa2bPdfUa1Document();
        assertCompliant(source, PDFAFlavour.PDFA_2_B, "unsigned source");
        assertCompliant(source, PDFAFlavour.PDFUA_1, "unsigned source");

        byte[] signed = sign(source, showSignature, showLogo);

        assertCompliant(signed, PDFAFlavour.PDFA_2_B, "signed");
        assertCompliant(signed, PDFAFlavour.PDFUA_1, "signed");
        try (PDDocument doc = Loader.loadPDF(signed)) {
            assertEquals(1, doc.getSignatureDictionaries().size());
        }
    }

    @Test
    void signatureWidgetKeyStaysPastAStaleParentTreeNextKey() throws Exception {
        byte[] signed = sign(buildPdfa2bPdfUa1Document(0), false, false);

        try (PDDocument doc = Loader.loadPDF(signed)) {
            PDStructureTreeRoot root = doc.getDocumentCatalog().getStructureTreeRoot();
            int widgetKey =
                    doc.getSignatureFields().getFirst().getWidgets().getFirst().getStructParent();
            assertEquals(1, widgetKey);
            assertEquals(2, root.getParentTreeNextKey());
            assertEquals(List.of(0, 1), parentTreeKeys(root.getParentTree()));
        }
    }

    private static List<Integer> parentTreeKeys(PDNumberTreeNode node) throws Exception {
        List<Integer> keys = new ArrayList<>();
        if (node.getNumbers() != null) {
            keys.addAll(new TreeMap<>(node.getNumbers()).keySet());
        }
        if (node.getKids() != null) {
            for (PDNumberTreeNode kid : node.getKids()) {
                keys.addAll(parentTreeKeys(kid));
            }
        }
        return keys;
    }

    private static byte[] sign(byte[] source, boolean showSignature, boolean showLogo)
            throws Exception {
        KeyStore keystore = KeyStore.getInstance("PKCS12");
        try (InputStream in = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
            keystore.load(in, "password".toCharArray());
        }
        CertSignController.CreateSignature signer =
                new CertSignController.CreateSignature(keystore, "password".toCharArray());

        CustomPDFDocumentFactory factory = mock(CustomPDFDocumentFactory.class);
        when(factory.load(any(org.springframework.web.multipart.MultipartFile.class)))
                .thenAnswer(inv -> Loader.loadPDF(source));

        MockMultipartFile input =
                new MockMultipartFile("fileInput", "in.pdf", "application/pdf", source);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        CertSignController.sign(
                factory,
                input,
                out,
                signer,
                showSignature,
                0,
                "Tester",
                "Here",
                "Approval",
                showLogo);
        return out.toByteArray();
    }

    private static void assertCompliant(byte[] pdf, PDFAFlavour flavour, String label)
            throws Exception {
        try (PDFAParser parser =
                Foundries.defaultInstance().createParser(new ByteArrayInputStream(pdf), flavour)) {
            PDFAValidator validator = Foundries.defaultInstance().createValidator(flavour, false);
            ValidationResult result = validator.validate(parser);
            String failures =
                    result.getTestAssertions().stream()
                            .filter(a -> a.getStatus() == TestAssertion.Status.FAILED)
                            .map(
                                    a ->
                                            a.getRuleId().getClause()
                                                    + "-"
                                                    + a.getRuleId().getTestNumber()
                                                    + " "
                                                    + a.getMessage())
                            .distinct()
                            .collect(Collectors.joining("\n"));
            assertTrue(
                    result.isCompliant(),
                    () -> label + " should pass " + flavour.getId() + ", failures:\n" + failures);
        }
    }

    private static byte[] buildPdfa2bPdfUa1Document() throws Exception {
        return buildPdfa2bPdfUa1Document(1);
    }

    private static byte[] buildPdfa2bPdfUa1Document(int parentTreeNextKey) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDDocumentCatalog catalog = doc.getDocumentCatalog();

            PDType0Font font;
            try (InputStream in =
                    new ClassPathResource("static/fonts/NotoSans-Regular.ttf").getInputStream()) {
                font = PDType0Font.load(doc, in);
            }

            PDStructureTreeRoot root = new PDStructureTreeRoot();
            catalog.setStructureTreeRoot(root);
            PDStructureElement document = new PDStructureElement("Document", root);
            root.appendKid(document);
            PDStructureElement paragraph = new PDStructureElement("P", document);
            paragraph.setPage(page);
            document.appendKid(paragraph);
            paragraph.appendKid(0);

            COSDictionary mcProperties = new COSDictionary();
            mcProperties.setInt(COSName.MCID, 0);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginMarkedContent(COSName.P, toPropertyList(mcProperties));
                cs.beginText();
                cs.setFont(font, 12);
                cs.newLineAtOffset(72, 760);
                cs.showText("A tagged, archivable document.");
                cs.endText();
                cs.endMarkedContent();
            }

            page.setStructParents(0);
            PDNumberTreeNode parentTree = new PDNumberTreeNode(COSArray.class);
            COSArray nums = new COSArray();
            nums.add(COSInteger.get(0));
            COSArray pageKids = new COSArray();
            pageKids.add(paragraph);
            nums.add(pageKids);
            parentTree.getCOSObject().setItem(COSName.NUMS, nums);
            root.setParentTree(parentTree);
            root.setParentTreeNextKey(parentTreeNextKey);

            PDMarkInfo markInfo = new PDMarkInfo();
            markInfo.setMarked(true);
            catalog.setMarkInfo(markInfo);
            catalog.setLanguage("en-US");
            PDViewerPreferences prefs = new PDViewerPreferences(new COSDictionary());
            prefs.setDisplayDocTitle(true);
            catalog.setViewerPreferences(prefs);
            doc.getDocumentInformation().setTitle(TITLE);

            PDMetadata metadata = new PDMetadata(doc);
            metadata.importXMPMetadata(xmp().getBytes(StandardCharsets.UTF_8));
            catalog.setMetadata(metadata);

            try (InputStream icc = new ClassPathResource("icc/sRGB2014.icc").getInputStream()) {
                PDOutputIntent intent = new PDOutputIntent(doc, icc);
                intent.setInfo("sRGB IEC61966-2.1");
                intent.setOutputCondition("sRGB IEC61966-2.1");
                intent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
                intent.setRegistryName("http://www.color.org");
                catalog.addOutputIntent(intent);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static org.apache.pdfbox.pdmodel.documentinterchange.markedcontent.PDPropertyList
            toPropertyList(COSDictionary dict) {
        return org.apache.pdfbox.pdmodel.documentinterchange.markedcontent.PDPropertyList.create(
                dict);
    }

    private static String xmp() {
        return List.of(
                        "<?xpacket begin=\"﻿\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>",
                        "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">",
                        "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">",
                        "<rdf:Description rdf:about=\"\"",
                        " xmlns:dc=\"http://purl.org/dc/elements/1.1/\"",
                        " xmlns:pdfaid=\"http://www.aiim.org/pdfa/ns/id/\"",
                        " xmlns:pdfuaid=\"http://www.aiim.org/pdfua/ns/id/\"",
                        " xmlns:pdfaExtension=\"http://www.aiim.org/pdfa/ns/extension/\"",
                        " xmlns:pdfaSchema=\"http://www.aiim.org/pdfa/ns/schema#\"",
                        " xmlns:pdfaProperty=\"http://www.aiim.org/pdfa/ns/property#\">",
                        "<dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">"
                                + TITLE
                                + "</rdf:li></rdf:Alt></dc:title>",
                        "<pdfaid:part>2</pdfaid:part>",
                        "<pdfaid:conformance>B</pdfaid:conformance>",
                        "<pdfuaid:part>1</pdfuaid:part>",
                        "<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType=\"Resource\">",
                        "<pdfaSchema:schema>PDF/UA Universal Accessibility Schema</pdfaSchema:schema>",
                        "<pdfaSchema:namespaceURI>http://www.aiim.org/pdfua/ns/id/</pdfaSchema:namespaceURI>",
                        "<pdfaSchema:prefix>pdfuaid</pdfaSchema:prefix>",
                        "<pdfaSchema:property><rdf:Seq><rdf:li rdf:parseType=\"Resource\">",
                        "<pdfaProperty:name>part</pdfaProperty:name>",
                        "<pdfaProperty:valueType>Integer</pdfaProperty:valueType>",
                        "<pdfaProperty:category>internal</pdfaProperty:category>",
                        "<pdfaProperty:description>PDF/UA version identifier</pdfaProperty:description>",
                        "</rdf:li></rdf:Seq></pdfaSchema:property>",
                        "</rdf:li></rdf:Bag></pdfaExtension:schemas>",
                        "</rdf:Description>",
                        "</rdf:RDF>",
                        "</x:xmpmeta>",
                        "<?xpacket end=\"w\"?>")
                .stream()
                .collect(Collectors.joining("\n"));
    }
}
