package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.CertificateAttribute;

/**
 * Tests for {@link CertificateAttributeService}. Certificates are generated in-process so the
 * assertions can pin exact values, and so the "field is missing" cases - the ones that decide what
 * the user is offered - can be produced deliberately rather than hoped for.
 */
class CertificateAttributeServiceTest {

    private static KeyPair keyPair;

    private final CertificateAttributeService service = new CertificateAttributeService();

    @BeforeAll
    static void generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keyPair = generator.generateKeyPair();
    }

    /** Builds a self-signed certificate whose subject and issuer DNs are given verbatim. */
    private static X509Certificate certificate(String subjectDn, String issuerDn) throws Exception {
        long now = 1_700_000_000_000L;
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        new X500Name(issuerDn),
                        BigInteger.valueOf(4886718345L),
                        new Date(now),
                        new Date(now + 86_400_000L),
                        new X500Name(subjectDn),
                        keyPair.getPublic());
        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256withRSA").build(keyPair.getPrivate());
        return new JcaX509CertificateConverter().getCertificate(builder.build(signer));
    }

    private static final Map<CertificateAttribute, String> NO_LABELS = Map.of();

    private static List<String> labels(List<SignatureAppearanceLayout.Field> fields) {
        return fields.stream().map(SignatureAppearanceLayout.Field::label).toList();
    }

    @Nested
    @DisplayName("Reading attributes off a certificate")
    class Extraction {

        @Test
        @DisplayName("Reads subject, issuer and certificate metadata")
        void readsAllPopulatedFields() throws Exception {
            X509Certificate cert =
                    certificate(
                            "CN=Samuel Saez,O=IMGA,OU=Desarrollo,C=ES,E=samuel@example.org",
                            "CN=Autoridad de Prueba,O=FNMT");

            Map<CertificateAttribute, String> attributes = service.extract(cert);

            assertEquals("Samuel Saez", attributes.get(CertificateAttribute.SUBJECT_COMMON_NAME));
            assertEquals("IMGA", attributes.get(CertificateAttribute.SUBJECT_ORGANISATION));
            assertEquals(
                    "Desarrollo", attributes.get(CertificateAttribute.SUBJECT_ORGANISATIONAL_UNIT));
            assertEquals("ES", attributes.get(CertificateAttribute.SUBJECT_COUNTRY));
            assertEquals("samuel@example.org", attributes.get(CertificateAttribute.SUBJECT_EMAIL));
            assertEquals(
                    "Autoridad de Prueba", attributes.get(CertificateAttribute.ISSUER_COMMON_NAME));
            assertEquals("FNMT", attributes.get(CertificateAttribute.ISSUER_ORGANISATION));
            assertEquals("123456789", attributes.get(CertificateAttribute.SERIAL_NUMBER));
            assertEquals(
                    "SHA256WITHRSA",
                    attributes.get(CertificateAttribute.SIGNATURE_ALGORITHM).toUpperCase());
        }

        @Test
        @DisplayName("Omits fields the certificate does not carry, rather than returning blanks")
        void omitsMissingFields() throws Exception {
            // A personal certificate with nothing but a name is entirely normal.
            X509Certificate cert = certificate("CN=Solo Nombre", "CN=Emisor");

            Map<CertificateAttribute, String> attributes = service.extract(cert);

            assertEquals("Solo Nombre", attributes.get(CertificateAttribute.SUBJECT_COMMON_NAME));
            // The UI offers exactly the keys present, so an absent field must not appear at all.
            assertFalse(attributes.containsKey(CertificateAttribute.SUBJECT_ORGANISATION));
            assertFalse(attributes.containsKey(CertificateAttribute.SUBJECT_EMAIL));
            assertFalse(attributes.containsKey(CertificateAttribute.SUBJECT_COUNTRY));
        }

        @Test
        @DisplayName("A null certificate yields no attributes instead of failing")
        void nullCertificate() {
            assertTrue(service.extract(null).isEmpty());
        }

        @Test
        @DisplayName("Validity dates are present and formatted")
        void validityDates() throws Exception {
            X509Certificate cert = certificate("CN=Fechas", "CN=Emisor");

            Map<CertificateAttribute, String> attributes = service.extract(cert);

            // Format is fixed rather than locale-dependent: the value is baked into the document.
            assertTrue(
                    attributes
                            .get(CertificateAttribute.VALID_FROM)
                            .matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}.*"),
                    "unexpected date format: " + attributes.get(CertificateAttribute.VALID_FROM));
            assertTrue(attributes.containsKey(CertificateAttribute.VALID_UNTIL));
        }
    }

    @Nested
    @DisplayName("Signature details and selection")
    class DisplayLines {

        @Test
        @DisplayName("Signing time, reason and location are added without touching the original")
        void addsSignatureDetails() throws Exception {
            Map<CertificateAttribute, String> base =
                    service.extract(certificate("CN=Samuel Saez", "CN=Emisor"));

            Map<CertificateAttribute, String> combined =
                    service.withSignatureDetails(
                            base, new Date(1_700_000_000_000L), "Conformidad", "Toledo");

            assertEquals("Conformidad", combined.get(CertificateAttribute.REASON));
            assertEquals("Toledo", combined.get(CertificateAttribute.LOCATION));
            assertTrue(combined.containsKey(CertificateAttribute.SIGNING_TIME));
            // The caller may reuse the extracted map, so it must come back unmodified.
            assertFalse(base.containsKey(CertificateAttribute.REASON));
        }

        @Test
        @DisplayName("Blank reason and location are dropped instead of drawing an empty label")
        void blankDetailsDropped() throws Exception {
            Map<CertificateAttribute, String> base =
                    service.extract(certificate("CN=Samuel Saez", "CN=Emisor"));

            Map<CertificateAttribute, String> combined =
                    service.withSignatureDetails(base, null, "   ", null);

            assertFalse(combined.containsKey(CertificateAttribute.REASON));
            assertFalse(combined.containsKey(CertificateAttribute.LOCATION));
            assertFalse(combined.containsKey(CertificateAttribute.SIGNING_TIME));
        }

        @Test
        @DisplayName("Only the selected attributes are rendered, in the order requested")
        void rendersSelectionInOrder() throws Exception {
            Map<CertificateAttribute, String> attributes =
                    service.extract(certificate("CN=Samuel Saez,O=IMGA,C=ES", "CN=Emisor"));

            List<SignatureAppearanceLayout.Field> fields =
                    service.toDisplayFields(
                            attributes,
                            List.of(
                                    CertificateAttribute.SUBJECT_ORGANISATION,
                                    CertificateAttribute.SUBJECT_COMMON_NAME),
                            NO_LABELS);

            assertEquals(List.of("Organisation", "Signed by"), labels(fields));
            assertEquals("IMGA", fields.get(0).value());
            assertEquals("Samuel Saez", fields.get(1).value());
            // The signer's name is the headline wherever the caller puts it in the order.
            assertFalse(fields.get(0).headline());
            assertTrue(fields.get(1).headline());
        }

        @Test
        @DisplayName("Selecting an attribute the certificate lacks draws nothing for it")
        void selectingAbsentAttribute() throws Exception {
            Map<CertificateAttribute, String> attributes =
                    service.extract(certificate("CN=Solo Nombre", "CN=Emisor"));

            List<SignatureAppearanceLayout.Field> fields =
                    service.toDisplayFields(
                            attributes,
                            List.of(
                                    CertificateAttribute.SUBJECT_COMMON_NAME,
                                    CertificateAttribute.SUBJECT_EMAIL),
                            NO_LABELS);

            // An empty "Email:" line in a signature would look like a defect.
            assertEquals(List.of("Signed by"), labels(fields));
        }

        @Test
        @DisplayName("The caller's labels are drawn in place of the English ones")
        void callerSuppliesTheLabels() throws Exception {
            Map<CertificateAttribute, String> attributes =
                    service.extract(certificate("CN=Samuel Saez,O=IMGA,C=ES", "CN=Emisor"));

            List<SignatureAppearanceLayout.Field> fields =
                    service.toDisplayFields(
                            attributes,
                            List.of(
                                    CertificateAttribute.SUBJECT_COMMON_NAME,
                                    CertificateAttribute.SUBJECT_ORGANISATION),
                            Map.of(CertificateAttribute.SUBJECT_COMMON_NAME, "Assinado por"));

            // The one that was translated is translated; the rest keeps the English label, which
            // is what a caller that only knows some of the fields should get.
            assertEquals(List.of("Assinado por", "Organisation"), labels(fields));
        }

        @Test
        @DisplayName("A null selection renders every available attribute")
        void nullSelectionRendersAll() throws Exception {
            Map<CertificateAttribute, String> attributes =
                    service.extract(certificate("CN=Samuel Saez,O=IMGA", "CN=Emisor"));

            List<String> labels = labels(service.toDisplayFields(attributes, null, NO_LABELS));

            assertTrue(labels.contains("Signed by"));
            assertTrue(labels.contains("Organisation"));
            assertTrue(labels.contains("Issued by"));
        }
    }
}
