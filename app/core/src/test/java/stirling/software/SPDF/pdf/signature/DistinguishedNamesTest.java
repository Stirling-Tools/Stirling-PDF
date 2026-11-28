package stirling.software.SPDF.pdf.signature;

import static org.junit.jupiter.api.Assertions.assertEquals;

import javax.security.auth.x500.X500Principal;

import org.junit.jupiter.api.Test;

class DistinguishedNamesTest {

    @Test
    void theNameComesFirstAndTheCountryLast() {
        X500Principal subject =
                new X500Principal("CN=Ada Lovelace, OU=Legal, O=Example Ltd, L=Leeds, C=GB");

        assertEquals(
                "CN=Ada Lovelace, OU=Legal, O=Example Ltd, L=Leeds, C=GB",
                DistinguishedNames.readable(subject));
    }

    @Test
    void anEmailAddressIsShownUnderItsShortName() {
        X500Principal subject =
                new X500Principal("EMAILADDRESS=ada@example.com, CN=Ada Lovelace, C=GB");

        assertEquals(
                "CN=Ada Lovelace, E=ada@example.com, C=GB", DistinguishedNames.readable(subject));
    }

    @Test
    void aCertificateThatListsTheCountryFirstStillLeadsWithTheName() {
        X500Principal subject = new X500Principal("C=US, O=Example Inc, CN=Example Server");

        assertEquals(
                "CN=Example Server, O=Example Inc, C=US", DistinguishedNames.readable(subject));
    }

    @Test
    void aCommaInsideAValueIsKeptEscaped() {
        X500Principal subject = new X500Principal("CN=Lovelace\\, Ada, O=Example Ltd");

        assertEquals("CN=Lovelace\\, Ada, O=Example Ltd", DistinguishedNames.readable(subject));
    }
}
