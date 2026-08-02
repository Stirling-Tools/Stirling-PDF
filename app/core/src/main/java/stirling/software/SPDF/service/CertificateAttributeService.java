package stirling.software.SPDF.service;

import java.security.cert.X509Certificate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.CertificateAttribute;

/**
 * Reads the fields of a signing certificate that a visible signature can display.
 *
 * <p>Certificates vary widely in what they carry: a personal certificate may have an email and no
 * organisation, a corporate one the reverse. Attributes that are absent are simply left out, so
 * callers can offer the user exactly the fields their own certificate provides instead of a fixed
 * list with blanks in it.
 */
@Slf4j
@Service
public class CertificateAttributeService {

    /**
     * Formatter for dates rendered into the signature. Chosen over a locale-dependent format so a
     * signature reads the same regardless of the server's locale, which matters because the
     * appearance is baked into the document.
     */
    private static final DateTimeFormatter DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z", Locale.ROOT);

    /**
     * Extracts every attribute the certificate actually carries.
     *
     * @param certificate the signing certificate
     * @return attributes in display order; absent fields are omitted rather than mapped to an empty
     *     string
     */
    public Map<CertificateAttribute, String> extract(X509Certificate certificate) {
        Map<CertificateAttribute, String> attributes = new EnumMap<>(CertificateAttribute.class);
        if (certificate == null) {
            return attributes;
        }

        X500Name subject = parseName(certificate.getSubjectX500Principal().getName());
        X500Name issuer = parseName(certificate.getIssuerX500Principal().getName());

        putIfPresent(
                attributes, CertificateAttribute.SUBJECT_COMMON_NAME, rdn(subject, BCStyle.CN));
        putIfPresent(
                attributes, CertificateAttribute.SUBJECT_ORGANISATION, rdn(subject, BCStyle.O));
        putIfPresent(
                attributes,
                CertificateAttribute.SUBJECT_ORGANISATIONAL_UNIT,
                rdn(subject, BCStyle.OU));
        putIfPresent(attributes, CertificateAttribute.SUBJECT_COUNTRY, rdn(subject, BCStyle.C));
        putIfPresent(attributes, CertificateAttribute.SUBJECT_EMAIL, rdn(subject, BCStyle.E));
        putIfPresent(attributes, CertificateAttribute.ISSUER_COMMON_NAME, rdn(issuer, BCStyle.CN));
        putIfPresent(attributes, CertificateAttribute.ISSUER_ORGANISATION, rdn(issuer, BCStyle.O));

        if (certificate.getSerialNumber() != null) {
            attributes.put(
                    CertificateAttribute.SERIAL_NUMBER, certificate.getSerialNumber().toString(16));
        }
        putIfPresent(
                attributes, CertificateAttribute.VALID_FROM, format(certificate.getNotBefore()));
        putIfPresent(
                attributes, CertificateAttribute.VALID_UNTIL, format(certificate.getNotAfter()));
        putIfPresent(
                attributes, CertificateAttribute.SIGNATURE_ALGORITHM, certificate.getSigAlgName());

        return attributes;
    }

    /**
     * Adds the signing-time, reason and location fields, which describe the act of signing rather
     * than the certificate and therefore cannot be read from it.
     *
     * @param attributes attributes already extracted from the certificate; not modified
     * @return a new map holding both sets, still in display order
     */
    public Map<CertificateAttribute, String> withSignatureDetails(
            Map<CertificateAttribute, String> attributes,
            Date signingTime,
            String reason,
            String location) {
        Map<CertificateAttribute, String> combined = new EnumMap<>(CertificateAttribute.class);
        combined.putAll(attributes);
        putIfPresent(combined, CertificateAttribute.SIGNING_TIME, format(signingTime));
        putIfPresent(combined, CertificateAttribute.REASON, reason);
        putIfPresent(combined, CertificateAttribute.LOCATION, location);
        return combined;
    }

    /**
     * Renders the attributes as display-ready lines, keeping only those the caller asked for.
     *
     * @param attributes every attribute available
     * @param selected the subset to render, in the order given by the enum; {@code null} means all
     * @return label/value pairs, ready to be drawn one per line
     */
    public Map<String, String> toDisplayLines(
            Map<CertificateAttribute, String> attributes, Iterable<CertificateAttribute> selected) {
        Map<String, String> lines = new LinkedHashMap<>();
        Iterable<CertificateAttribute> wanted = selected != null ? selected : attributes.keySet();
        for (CertificateAttribute attribute : wanted) {
            String value = attributes.get(attribute);
            if (value != null && !value.isBlank()) {
                lines.put(label(attribute), value);
            }
        }
        return lines;
    }

    /** Human-readable label drawn in front of an attribute's value. */
    public static String label(CertificateAttribute attribute) {
        return switch (attribute) {
            case SUBJECT_COMMON_NAME -> "Signed by";
            case SUBJECT_ORGANISATION -> "Organisation";
            case SUBJECT_ORGANISATIONAL_UNIT -> "Unit";
            case SUBJECT_COUNTRY -> "Country";
            case SUBJECT_EMAIL -> "Email";
            case ISSUER_COMMON_NAME -> "Issued by";
            case ISSUER_ORGANISATION -> "Issuer org";
            case SERIAL_NUMBER -> "Serial";
            case VALID_FROM -> "Valid from";
            case VALID_UNTIL -> "Valid until";
            case SIGNATURE_ALGORITHM -> "Algorithm";
            case SIGNING_TIME -> "Date";
            case REASON -> "Reason";
            case LOCATION -> "Location";
        };
    }

    private X500Name parseName(String distinguishedName) {
        try {
            return new X500Name(distinguishedName);
        } catch (IllegalArgumentException e) {
            // A malformed DN must not stop the signature: the remaining fields are still usable.
            log.debug("Could not parse distinguished name '{}'", distinguishedName, e);
            return null;
        }
    }

    private String rdn(X500Name name, org.bouncycastle.asn1.ASN1ObjectIdentifier oid) {
        if (name == null) {
            return null;
        }
        RDN[] rdns = name.getRDNs(oid);
        if (rdns == null || rdns.length == 0) {
            return null;
        }
        return IETFUtils.valueToString(rdns[0].getFirst().getValue());
    }

    private String format(Date date) {
        if (date == null) {
            return null;
        }
        return DATE_FORMAT.format(
                ZonedDateTime.ofInstant(date.toInstant(), ZoneId.systemDefault()));
    }

    private void putIfPresent(
            Map<CertificateAttribute, String> target, CertificateAttribute key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }
}
