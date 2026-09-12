package stirling.software.SPDF.model.api.security;

/**
 * A field of a signing certificate that can be shown inside the visible signature.
 *
 * <p>The identifiers are part of the API: clients send back the subset they want drawn, so renaming
 * one is a breaking change.
 */
public enum CertificateAttribute {

    /** Common name of the subject - the person or entity the certificate identifies. */
    SUBJECT_COMMON_NAME,

    /** Organisation the subject belongs to. */
    SUBJECT_ORGANISATION,

    /** Organisational unit within the subject's organisation. */
    SUBJECT_ORGANISATIONAL_UNIT,

    /** Country code of the subject. */
    SUBJECT_COUNTRY,

    /** Email address carried in the subject DN, when present. */
    SUBJECT_EMAIL,

    /** Common name of the authority that issued the certificate. */
    ISSUER_COMMON_NAME,

    /** Organisation of the issuing authority. */
    ISSUER_ORGANISATION,

    /** Certificate serial number. */
    SERIAL_NUMBER,

    /** Start of the certificate's validity window. */
    VALID_FROM,

    /** End of the certificate's validity window. */
    VALID_UNTIL,

    /** Algorithm used to sign the certificate, e.g. SHA256withRSA. */
    SIGNATURE_ALGORITHM,

    /** Moment the document was signed. Comes from the signature, not the certificate. */
    SIGNING_TIME,

    /** Reason for signing, as supplied in the request. */
    REASON,

    /** Location of signing, as supplied in the request. */
    LOCATION
}
