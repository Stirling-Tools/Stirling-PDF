package stirling.software.proprietary.workflow.dto;

import java.util.Date;

/**
 * Certificate metadata extracted from a keystore submission. Returned by
 * CertificateSubmissionValidator after successful validation so callers can surface details
 * (expiry, subject) to the user.
 */
public record CertificateInfo(
        String subjectName, String issuerName, Date notBefore, Date notAfter, boolean selfSigned) {}
