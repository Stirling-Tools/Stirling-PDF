package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import javax.security.auth.x500.X500Principal;

import org.junit.jupiter.api.Test;

class CertSignDistinguishedNameTest {

    @Test
    void theNameComesFirstAndTheCountryLast() {
        X500Principal subject =
                new X500Principal("CN=Ada Lovelace, OU=Legal, O=Example Ltd, L=Leeds, C=GB");

        assertEquals(
                "CN=Ada Lovelace, OU=Legal, O=Example Ltd, L=Leeds, C=GB",
                CertSignController.CreateSignature.distinguishedName(subject));
    }

    @Test
    void anEmailAddressIsShownUnderItsShortName() {
        X500Principal subject =
                new X500Principal("EMAILADDRESS=ada@example.com, CN=Ada Lovelace, C=GB");

        assertEquals(
                "CN=Ada Lovelace, E=ada@example.com, C=GB",
                CertSignController.CreateSignature.distinguishedName(subject));
    }

    @Test
    void aCertificateThatListsTheCountryFirstStillLeadsWithTheName() {
        X500Principal subject = new X500Principal("C=US, O=Example Inc, CN=Example Server");

        assertEquals(
                "CN=Example Server, O=Example Inc, C=US",
                CertSignController.CreateSignature.distinguishedName(subject));
    }

    @Test
    void aCommaInsideAValueIsKeptEscaped() {
        X500Principal subject = new X500Principal("CN=Lovelace\\, Ada, O=Example Ltd");

        assertEquals(
                "CN=Lovelace\\, Ada, O=Example Ltd",
                CertSignController.CreateSignature.distinguishedName(subject));
    }
}
