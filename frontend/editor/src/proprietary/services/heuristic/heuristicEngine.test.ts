// Core fidelity cases for the heuristic engine against the real rules pack.

import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  detectEnglish,
  ensureRulesLoaded,
} from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

beforeAll(async () => {
  await ensureRulesLoaded();
});

function classify(title: string, body: string) {
  const doc: HeuristicDoc = {
    fileName: "doc.pdf",
    pageCount: 1,
    meta: {},
    titleZone: title,
    firstZone: body,
    allZone: body,
  };
  return classifyHeuristic(doc);
}

describe("heuristic engine port fidelity", () => {
  it("classifies an invoice as invoice", () => {
    const body = [
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
      "Payment Terms: Net 30. Please quote the invoice number with payment.",
    ].join("\n");
    const r = classify("INVOICE", body);
    expect(r.labels.length).toBeGreaterThan(0);
    expect(r.labels[0]).toBe("invoice");
  });

  it("classifies a curriculum vitae as resume", () => {
    const body = [
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
      "References available on request.",
    ].join("\n");
    const r = classify("CURRICULUM VITAE", body);
    expect(r.labels.length).toBeGreaterThan(0);
    expect(r.labels[0]).toBe("resume");
  });

  it("classifies a boarding pass as ticket", () => {
    const body = [
      "BOARDING PASS",
      "British Airways",
      "Passenger: SMITH/JANE MS",
      "Flight: BA 117    Date: 22 APR 2024",
      "From: LONDON HEATHROW (LHR)  Terminal 5",
      "To: NEW YORK JFK (JFK)",
      "Departure: 11:20   Boarding Time: 10:35   Gate: B44",
      "Seat: 34K   Group: 3   Class: Economy",
      "Booking Reference: XK9PLQ",
      "Please be at the gate 45 minutes before departure.",
    ].join("\n");
    const r = classify("BOARDING PASS", body);
    expect(r.labels.length).toBeGreaterThan(0);
    expect(r.labels[0]).toBe("ticket");
  });

  it("classifies an NDA as nda", () => {
    const body = [
      "NON-DISCLOSURE AGREEMENT",
      "This Mutual Non-Disclosure Agreement (the Agreement) is entered into",
      "by and between Stirling Systems Ltd and the Receiving Party.",
      "1. Confidential Information means any proprietary data disclosed by a party.",
      "2. Obligations: The Receiving Party shall hold all Confidential Information",
      "in strict confidence and not disclose it to any third party.",
      "3. Term: The obligations survive for a period of five (5) years.",
      "4. Governing Law: This Agreement is governed by the laws of England and Wales.",
      "Accepted and agreed by the authorised representatives of the parties.",
    ].join("\n");
    const r = classify("NON-DISCLOSURE AGREEMENT", body);
    expect(r.labels.length).toBeGreaterThan(0);
    expect(r.labels[0]).toBe("nda");
  });

  it("does not classify a non-English (Spanish) document", () => {
    const body = [
      "CONTRATO DE ARRENDAMIENTO DE VIVIENDA",
      "Este contrato de arrendamiento se celebra entre el arrendador y el",
      "arrendatario para la vivienda situada en la ciudad.",
      "El arrendatario pagara una renta mensual de 1150 euros segun las",
      "condiciones que las partes acuerdan por el plazo de doce meses.",
      "Ambas partes firman este documento segun la ley aplicable.",
    ].join("\n");
    const r = classify("CONTRATO DE ARRENDAMIENTO", body);
    expect(r.isEnglish).toBe(false);
    expect(r.labels).toHaveLength(0);
  });

  it("detects English prose", () => {
    const english =
      "This agreement is made between the parties and shall be governed by the laws" +
      " of England. The tenant agrees to pay the rent that is due under this" +
      " contract for the property.";
    expect(detectEnglish(english).isEnglish).toBe(true);
  });
});
