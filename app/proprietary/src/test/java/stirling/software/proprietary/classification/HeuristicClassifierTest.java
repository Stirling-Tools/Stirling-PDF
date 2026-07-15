package stirling.software.proprietary.classification;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.classification.HeuristicClassifier.HeuristicDoc;
import stirling.software.proprietary.classification.HeuristicClassifier.HeuristicResult;

/**
 * Cross-checks the Java heuristic port against the labels the TypeScript engine produced for the
 * same documents (verified live in the browser: invoice->invoice, CV->resume, boarding
 * pass->ticket, etc.). Guards the port from silent scoring drift.
 */
class HeuristicClassifierTest {

    private static final HeuristicClassifier CLASSIFIER = new HeuristicClassifier();

    private static HeuristicResult classify(String title, String body) {
        return CLASSIFIER.classify(new HeuristicDoc("doc.pdf", 1, Map.of(), title, body, body));
    }

    @Test
    void invoiceClassifiesAsInvoice() {
        String body =
                String.join(
                        "\n",
                        "INVOICE",
                        "Acme Web Services Ltd",
                        "123 High Street, London, EC1A 4JQ",
                        "Invoice Number: INV-2024-0117",
                        "Invoice Date: 14 March 2024",
                        "Due Date: 13 April 2024",
                        "Bill To: Northwind Trading Company",
                        "Description            Qty    Unit Price    Amount",
                        "Website hosting (annual)   1      480.00       480.00",
                        "Subtotal: 930.00",
                        "VAT (20%): 186.00",
                        "Total Due: 1,116.00",
                        "Payment Terms: Net 30. Please quote the invoice number with payment.");
        HeuristicResult r = classify("INVOICE", body);
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("invoice");
    }

    @Test
    void curriculumVitaeClassifiesAsResume() {
        String body =
                String.join(
                        "\n",
                        "CURRICULUM VITAE",
                        "Jordan Ellis",
                        "Bristol, UK | jordan.ellis@example.com | 07700 900123",
                        "Professional Summary",
                        "Experienced software engineer with 8 years building web platforms.",
                        "Work Experience",
                        "Senior Engineer, Northwind Ltd (2020-present)",
                        "Education",
                        "BSc Computer Science, University of Bristol, 2016",
                        "Skills",
                        "TypeScript, Java, React, cloud architecture, mentoring",
                        "References available on request.");
        HeuristicResult r = classify("CURRICULUM VITAE", body);
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("resume");
    }

    @Test
    void boardingPassClassifiesAsTicket() {
        String body =
                String.join(
                        "\n",
                        "BOARDING PASS",
                        "British Airways",
                        "Passenger: SMITH/JANE MS",
                        "Flight: BA 117    Date: 22 APR 2024",
                        "From: LONDON HEATHROW (LHR)  Terminal 5",
                        "To: NEW YORK JFK (JFK)",
                        "Departure: 11:20   Boarding Time: 10:35   Gate: B44",
                        "Seat: 34K   Group: 3   Class: Economy",
                        "Booking Reference: XK9PLQ",
                        "Please be at the gate 45 minutes before departure.");
        HeuristicResult r = classify("BOARDING PASS", body);
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("ticket");
    }

    @Test
    void ndaClassifiesAsNda() {
        String body =
                String.join(
                        "\n",
                        "NON-DISCLOSURE AGREEMENT",
                        "This Mutual Non-Disclosure Agreement (the Agreement) is entered into",
                        "by and between Stirling Systems Ltd and the Receiving Party.",
                        "1. Confidential Information means any proprietary data disclosed by a party.",
                        "2. Obligations: The Receiving Party shall hold all Confidential Information",
                        "in strict confidence and not disclose it to any third party.",
                        "3. Term: The obligations survive for a period of five (5) years.",
                        "4. Governing Law: This Agreement is governed by the laws of England and Wales.",
                        "Accepted and agreed by the authorised representatives of the parties.");
        HeuristicResult r = classify("NON-DISCLOSURE AGREEMENT", body);
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("nda");
    }

    @Test
    void spanishDocumentIsNotClassified() {
        String body =
                String.join(
                        "\n",
                        "CONTRATO DE ARRENDAMIENTO DE VIVIENDA",
                        "Este contrato de arrendamiento se celebra entre el arrendador y el",
                        "arrendatario para la vivienda situada en la ciudad.",
                        "El arrendatario pagara una renta mensual de 1150 euros segun las",
                        "condiciones que las partes acuerdan por el plazo de doce meses.",
                        "Ambas partes firman este documento segun la ley aplicable.");
        HeuristicResult r = classify("CONTRATO DE ARRENDAMIENTO", body);
        assertThat(r.isEnglish()).isFalse();
        assertThat(r.labels()).isEmpty();
    }

    @Test
    void detectsEnglishProse() {
        String english =
                "This agreement is made between the parties and shall be governed by the laws"
                        + " of England. The tenant agrees to pay the rent that is due under this"
                        + " contract for the property.";
        assertThat(HeuristicClassifier.detectEnglish(english).isEnglish()).isTrue();
    }
}
