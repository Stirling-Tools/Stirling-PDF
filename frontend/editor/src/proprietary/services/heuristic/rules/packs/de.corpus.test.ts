import { describe, expect, it } from "vitest";
import { classifyHeuristic } from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

interface Case {
  /** Expected top label; "" asserts the document stays unlabelled. */
  expect: string;
  file: string;
  pages?: number;
  /** Strip every diacritic, as plenty of text layers do. */
  stripped?: boolean;
  meta?: Record<string, string>;
  title: string;
  body: string[];
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

const run = async (c: Case) => {
  const title = c.stripped ? strip(c.title) : c.title;
  const body = c.stripped ? strip(c.body.join("\n")) : c.body.join("\n");
  const doc: HeuristicDoc = {
    fileName: c.file,
    pageCount: c.pages ?? 1,
    meta: c.meta ?? {},
    titleZone: title,
    firstZone: body,
    allZone: body,
  };
  // The app passes the reader's interface language; several of these specimens
  // are data-dense enough that it is the only thing naming German.
  return classifyHeuristic(doc, { localeHint: "de-DE" });
};

const CASES: Case[] = [
  {
    expect: "invoice",
    title: "Rechnung",
    file: "2024-014.pdf",
    body: [
      "Rechnung",
      "Mills Design GmbH, Fernweg 14, 10115 Berlin",
      "Rechnungsnummer: 2024-014    Rechnungsdatum: 3. Mai 2024",
      "Rechnungsempfänger: Harbour Café GmbH, Hafenstraße 8, 20457 Hamburg",
      "Überarbeitung des Logos und der Markenrichtlinien      950,00",
      "Neugestaltung der Speisekarte (zwei Korrekturläufe)     250,00",
      "Gesamtbetrag netto 1.200,00 zuzüglich Mehrwertsteuer 228,00",
      "Zahlungsbedingungen: Der Betrag ist zahlbar innerhalb von dreißig Tagen",
      "nach Erhalt dieser Rechnung auf das unten genannte Konto.",
      "USt-IdNr. DE123456789",
    ],
  },
  {
    expect: "invoice",
    title: "RECHNUNG",
    file: "rechnung_maerz.pdf",
    stripped: true,
    body: [
      "RECHNUNG",
      "Rechnungsnummer: R-2024-0093   Rechnungsdatum: 12. März 2024",
      "Rechnungsempfänger: Bauer Logistik KG",
      "Wartung der Förderanlage, Einsatz am 4. März     480,00",
      "Ersatzteile nach Aufstellung                      215,50",
      "Zu zahlender Betrag: 827,44 einschließlich Mehrwertsteuer.",
      "Der Betrag ist zahlbar innerhalb von vierzehn Tagen ohne Abzug.",
    ],
  },
  {
    expect: "receipt",
    title: "Quittung",
    file: "quittung.pdf",
    body: [
      "Quittung",
      "Wir bestätigen den Erhalt des folgenden Betrages.",
      "Betrag erhalten: 85,00 in Worten: fünfundachtzig Euro",
      "Zahlungsart: Bargeld",
      "Vielen Dank für Ihren Einkauf bei uns.",
      "Hofladen Brandt, Dorfstraße 3, 17291 Prenzlau",
    ],
  },
  {
    expect: "credit-note",
    title: "Gutschrift",
    file: "gutschrift_2024_11.pdf",
    body: [
      "Gutschrift",
      "Gutschriftsnummer: G-2024-0011, Datum 9. Juni 2024",
      "Bezug: Rechnung 2024-0098 vom 2. Mai 2024",
      "Wir schreiben Ihnen den folgenden Betrag aufgrund der Rücksendung gut.",
      "Zwei Stühle, beschädigt angeliefert     -318,00",
      "Der Betrag wird auf Ihr Konto überwiesen.",
    ],
  },
  {
    expect: "quote",
    title: "Angebot",
    file: "angebot_2024.pdf",
    body: [
      "Angebot",
      "Angebotsnummer: A-2024-0042, erstellt am 8. Februar 2024",
      "Sehr geehrte Frau Richter, vielen Dank für Ihre Anfrage.",
      "Gerne unterbreiten wir Ihnen das folgende unverbindliche Angebot für die",
      "Sanierung der Hofeinfahrt einschließlich aller Nebenarbeiten.",
      "Pflasterarbeiten nach Aufmaß      4.800,00",
      "Dieses Angebot gültig bis 31. März 2024.",
    ],
  },
  {
    expect: "order-confirmation",
    title: "Auftragsbestätigung",
    file: "auftragsbestaetigung.pdf",
    body: [
      "Auftragsbestätigung",
      "Vielen Dank für Ihre Bestellung vom 14. Januar 2024.",
      "Wir bestätigen Ihnen den folgenden Auftrag und liefern voraussichtlich",
      "in der achten Kalenderwoche an die von Ihnen genannte Adresse.",
      "Position 1: Regalsystem Buche, vier Elemente     1.160,00",
    ],
  },
  {
    expect: "delivery-note",
    title: "Lieferschein",
    file: "lieferschein_8841.pdf",
    body: [
      "Lieferschein",
      "Lieferscheinnummer: 8841, Datum 22. August 2024",
      "Lieferadresse: Schreinerei Vogt, Am Anger 12, 85049 Ingolstadt",
      "Versandart: Spedition, zwei Paletten",
      "Bitte prüfen Sie die Sendung unverzüglich auf Vollständigkeit.",
      "Eichenbretter 24 mm, 40 Stück",
    ],
  },
  {
    expect: "bank-statement",
    title: "Kontoauszug",
    file: "kontoauszug_2024_07.pdf",
    pages: 2,
    body: [
      "Kontoauszug Nummer 7 für Juli 2024",
      "Kontonummer DE02 1203 0000 0000 2020 51",
      "Alter Kontostand: 4.218,77",
      "Buchungstag  Wertstellung  Vorgang                      Betrag",
      "02.07.       02.07.        Dauerauftrag Miete        -1.050,00",
      "05.07.       05.07.        Gehalt Juli                3.240,18",
      "11.07.       11.07.        Kartenzahlung REWE           -62,43",
      "Neuer Kontostand: 6.346,52",
    ],
  },
  {
    expect: "payslip",
    title: "Gehaltsabrechnung",
    file: "gehaltsabrechnung_juni.pdf",
    body: [
      "Gehaltsabrechnung Juni 2024",
      "Personalnummer 4418, Steuerklasse III, Kinderfreibetrag 1,0",
      "Gesamtbrutto 4.100,00",
      "Lohnsteuer 612,33, Solidaritätszuschlag 0,00, Kirchensteuer 55,10",
      "Krankenversicherung 332,10, Rentenversicherung 381,30",
      "Auszahlungsbetrag 2.498,44",
    ],
  },
  {
    expect: "tax-statement",
    title: "Lohnsteuerbescheinigung",
    file: "lohnsteuerbescheinigung_2023.pdf",
    body: [
      "Besondere Lohnsteuerbescheinigung für das Kalenderjahr 2023",
      "Bruttoarbeitslohn einschließlich Sachbezüge 49.200,00",
      "Einbehaltene Lohnsteuer 7.348,00",
      "Arbeitnehmeranteil zur gesetzlichen Rentenversicherung 4.575,60",
      "Die Bescheinigung wurde elektronisch an das Finanzamt übermittelt.",
    ],
  },
  {
    expect: "utility-bill",
    title: "Jahresverbrauchsabrechnung Strom",
    file: "stromrechnung_2024.pdf",
    body: [
      "Jahresverbrauchsabrechnung Strom",
      "Zählernummer 1EWD0032188, Zählerstand alt 41.208, Zählerstand neu 44.871",
      "Verbrauch im Abrechnungszeitraum: 3.663 Kilowattstunden",
      "Grundpreis und Arbeitspreis nach beigefügter Preisübersicht",
      "Gezahlte Abschlagszahlung 1.080,00, Nachzahlung 212,58",
    ],
  },
  {
    expect: "employment-contract",
    title: "Arbeitsvertrag",
    file: "arbeitsvertrag.pdf",
    pages: 6,
    body: [
      "Arbeitsvertrag",
      "zwischen der Nordlicht Medien GmbH und Frau Katrin Seibold",
      "Die Arbeitszeit beträgt wöchentlich achtunddreißig Stunden.",
      "Die ersten sechs Monate gelten als Probezeit.",
      "Der Urlaubsanspruch beträgt dreißig Arbeitstage im Kalenderjahr.",
      "Die Kündigungsfrist richtet sich nach den gesetzlichen Vorschriften.",
      "Ort, Datum, Unterschrift der Vertragsparteien",
    ],
  },
  {
    expect: "lease-agreement",
    title: "Mietvertrag",
    file: "mietvertrag_wohnung.pdf",
    pages: 8,
    body: [
      "Mietvertrag über Wohnraum",
      "Der Vermieter vermietet dem Mieter die Wohnung im zweiten Obergeschoss.",
      "Die Kaltmiete beträgt 780,00 monatlich, die Nebenkosten 190,00.",
      "Die Kaution in Höhe von drei Monatsmieten ist bei Übergabe zu leisten.",
      "Die Mietsache umfasst drei Zimmer, Küche, Bad und einen Kellerraum.",
    ],
  },
  {
    expect: "nda",
    title: "Vertraulichkeitsvereinbarung",
    file: "nda_de.pdf",
    pages: 4,
    body: [
      "Vertraulichkeitsvereinbarung",
      "Die Parteien beabsichtigen, über eine Zusammenarbeit zu verhandeln, und",
      "werden dabei vertrauliche Informationen austauschen.",
      "Der Empfänger verpflichtet sich, die erhaltenen Informationen geheim zu",
      "halten und ausschließlich für den vereinbarten Zweck zu verwenden.",
      "Diese Verpflichtung gilt für fünf Jahre nach Beendigung der Gespräche.",
    ],
  },
  {
    expect: "privacy-policy",
    title: "Datenschutzerklärung",
    file: "datenschutz.pdf",
    pages: 5,
    body: [
      "Datenschutzerklärung",
      "Verantwortlicher im Sinne der DSGVO ist die Weber Handels GmbH.",
      "Wir verarbeiten personenbezogene Daten ausschließlich auf Grundlage der",
      "gesetzlichen Bestimmungen und nur für die genannten Zwecke.",
      "Sie haben das Recht auf Auskunft, Berichtigung und Löschung Ihrer Daten.",
    ],
  },
  {
    expect: "terms-and-conditions",
    title: "Allgemeine Geschäftsbedingungen",
    file: "agb.pdf",
    pages: 7,
    body: [
      "Allgemeine Geschäftsbedingungen",
      "Diese Bedingungen gelten für alle Verträge, die über unseren Onlineshop",
      "geschlossen werden. Der Geltungsbereich erstreckt sich auf Verbraucher",
      "und Unternehmer gleichermaßen.",
      "Abweichende Bedingungen des Kunden werden nicht anerkannt.",
    ],
  },
  {
    expect: "resume",
    title: "Lebenslauf",
    file: "lebenslauf_seibold.pdf",
    pages: 2,
    body: [
      "Lebenslauf",
      "Persönliche Daten: Katrin Seibold, geboren am 4. September 1989 in Kiel",
      "Berufserfahrung",
      "2019 bis heute, Projektleiterin bei der Nordlicht Medien GmbH",
      "2015 bis 2019, Redakteurin bei der Küstenzeitung",
      "Ausbildung: Studium der Medienwissenschaft in Hamburg",
      "Sprachkenntnisse: Deutsch als Muttersprache, Englisch verhandlungssicher",
    ],
  },
  {
    expect: "cover-letter",
    title: "Bewerbung als Projektleiterin",
    file: "anschreiben.pdf",
    body: [
      "Bewerbung als Projektleiterin",
      "Sehr geehrte Damen und Herren,",
      "mit großem Interesse habe ich Ihre Stellenausschreibung gelesen und",
      "ich bewerbe mich hiermit auf die ausgeschriebene Position.",
      "In meiner bisherigen Tätigkeit habe ich Projekte von der Konzeption bis",
      "zur Auslieferung verantwortet und Teams von bis zu acht Personen geführt.",
      "Über die Einladung zu einem Gespräch würde ich mich sehr freuen.",
      "Mit freundlichen Grüßen, Katrin Seibold",
    ],
  },
  {
    expect: "reference-letter",
    title: "Arbeitszeugnis",
    file: "arbeitszeugnis.pdf",
    body: [
      "Arbeitszeugnis",
      "Frau Katrin Seibold war vom 1. März 2015 bis zum 31. Dezember 2019 in",
      "unserem Unternehmen als Redakteurin beschäftigt.",
      "Sie erledigte die ihr übertragenen Aufgaben stets zur vollsten",
      "Zufriedenheit und zeichnete sich durch hohe Belastbarkeit aus.",
      "Wir bedauern ihr Ausscheiden und wünschen ihr alles Gute.",
    ],
  },
  {
    expect: "insurance-policy",
    title: "Versicherungsschein",
    file: "versicherungsschein.pdf",
    pages: 3,
    body: [
      "Versicherungsschein Hausratversicherung",
      "Versicherungsnummer HR-55 281 904, Versicherungsbeginn 1. Juli 2024",
      "Die Deckungssumme beträgt 85.000,00 für den gesamten Hausrat.",
      "Die Selbstbeteiligung je Schadenfall beträgt 150,00.",
      "Der Beitrag wird jährlich im Voraus erhoben.",
    ],
  },
  {
    expect: "medical-report",
    title: "Arztbrief",
    file: "arztbrief.pdf",
    body: [
      "Arztbrief",
      "Sehr geehrter Herr Kollege, wir berichten über die genannte Patientin.",
      "Anamnese: Seit etwa drei Wochen bestehen belastungsabhängige Beschwerden",
      "im rechten Knie ohne vorausgegangenes Trauma.",
      "Diagnose: Gonarthrose rechts, beginnend.",
      "Wir empfehlen Physiotherapie und eine Kontrolle in sechs Wochen.",
    ],
  },
  {
    // recipe is emit:false in core, so the assertion is that it stays unlabelled
    // rather than landing on prescription - "Rezept" is both words in German.
    expect: "",
    title: "Zwiebelkuchen",
    file: "zwiebelkuchen.pdf",
    body: [
      "Zwiebelkuchen vom Blech",
      "Zutaten für vier Portionen",
      "500 Gramm Mehl, ein Päckchen Trockenhefe, 250 Milliliter lauwarme Milch",
      "Ein Kilogramm Zwiebeln, 200 Gramm durchwachsener Speck, drei Eier",
      "Zubereitung",
      "Den Backofen auf 200 Grad vorheizen und das Blech einfetten.",
      "Die Zwiebeln in Ringe schneiden und mit dem Speck anbraten.",
      "Zwei Esslöffel Kümmel unterrühren und etwa vierzig Minuten backen.",
    ],
  },
  {
    expect: "booking-confirmation",
    title: "Buchungsbestätigung",
    file: "buchungsbestaetigung.pdf",
    body: [
      "Buchungsbestätigung",
      "Buchungsnummer 4471-ZX, bestätigt am 2. April 2024",
      "Anreise: Freitag, 12. Juli 2024, Abreise: Sonntag, 14. Juli 2024",
      "Doppelzimmer mit Frühstück für zwei Personen",
      "Gasthof Talblick, Hauptstraße 27, 87561 Oberstdorf",
    ],
  },
  {
    expect: "user-guide",
    title: "Bedienungsanleitung",
    file: "bedienungsanleitung.pdf",
    pages: 24,
    body: [
      "Bedienungsanleitung Kaffeevollautomat KV 840",
      "Sicherheitshinweise: Lesen Sie diese Anleitung vor der Inbetriebnahme",
      "vollständig durch und bewahren Sie sie auf.",
      "Inbetriebnahme: Füllen Sie den Wassertank bis zur Markierung und setzen",
      "Sie ihn bis zum Anschlag ein.",
      "Reinigung: Entnehmen Sie die Brüheinheit und spülen Sie sie unter",
      "fließendem Wasser ab.",
    ],
  },
  {
    expect: "thesis",
    title: "Masterarbeit",
    file: "masterarbeit.pdf",
    pages: 96,
    body: [
      "Masterarbeit",
      "Zur Erlangung des akademischen Grades Master of Science",
      "Erstgutachter: Prof. Dr. Helmut Brandis",
      "Zweitgutachter: Prof. Dr. Anja Liebermann",
      "Eidesstattliche Erklärung",
      "Ich versichere, dass ich die vorliegende Arbeit selbstständig und ohne",
      "fremde Hilfe angefertigt habe.",
      "Literaturverzeichnis",
      "Brandis, H. (2019). Verfahren der Oberflächenanalytik. Berlin.",
    ],
  },
  {
    expect: "meeting-minutes",
    title: "Sitzungsprotokoll",
    file: "protokoll_2024_03.pdf",
    body: [
      "Sitzungsprotokoll der Mitgliederversammlung",
      "Anwesend: sieben von neun Vorstandsmitgliedern",
      "Tagesordnungspunkt 1: Genehmigung des Protokolls der Vorsitzung",
      "Tagesordnungspunkt 2: Bericht des Kassenwarts",
      "Beschluss: Der Vorstand wird einstimmig entlastet.",
    ],
  },
  {
    expect: "press-release",
    title: "Pressemitteilung",
    file: "pressemitteilung.pdf",
    body: [
      "Pressemitteilung",
      "Zur sofortigen Veröffentlichung, Hamburg, 18. September 2024",
      "Die Nordlicht Medien GmbH eröffnet einen zweiten Standort in Leipzig und",
      "schafft damit im kommenden Jahr vierzig neue Arbeitsplätze.",
      "Für Rückfragen wenden Sie sich an die Pressestelle.",
    ],
  },
  {
    expect: "safety-data-sheet",
    title: "Sicherheitsdatenblatt",
    file: "sicherheitsdatenblatt.pdf",
    pages: 11,
    body: [
      "Sicherheitsdatenblatt gemäß Verordnung (EG) Nr. 1907/2006",
      "Abschnitt 1: Bezeichnung des Stoffs und des Unternehmens",
      "Abschnitt 2: Mögliche Gefahren. Gefahrenhinweise: Verursacht schwere",
      "Augenreizung. Gefahrstoff nach Einstufung des Herstellers.",
      "Abschnitt 4: Erste-Hilfe-Maßnahmen",
    ],
  },
  {
    // Nothing German about it beyond the greeting: a mostly-English document must
    // not be dragged into the German pack by one phrase.
    expect: "invoice",
    title: "INVOICE",
    file: "invoice_berlin_office.pdf",
    body: [
      "INVOICE",
      "Mills Design Ltd, 14 Fern Road, Bristol BS1 5TR",
      "Invoice Number: INV-2024-0455    Invoice Date: 9 October 2024",
      "Bill To: Nordlicht Medien GmbH, Hamburg",
      "Brand guidelines, second revision                900.00",
      "Total Due: 1,080.00 including VAT",
      "Payment terms: Net 30. Please quote the invoice number with payment.",
      "Mit freundlichen Grüßen / Kind regards, Jane Mills",
    ],
  },
];

describe("German pack corpus", () => {
  it.each(CASES.map((c) => [c.expect || `nothing (${c.file})`, c] as const))(
    "labels a %s correctly",
    async (_label, c) => {
      const r = await run(c);
      const detail = `expected ${c.expect || "no label"}, got [${r.labels.join(", ")}] (language ${r.language ?? "?"}, packs [${r.packs.join(", ")}], confidence ${r.confidence}, score ${r.score})`;
      if (c.expect === "") {
        expect(r.labels, detail).toEqual([]);
      } else {
        expect(r.labels[0], detail).toBe(c.expect);
      }
    },
  );

  it("scores every German specimen against the German pack", async () => {
    const german = CASES.filter((c) => c.file !== "invoice_berlin_office.pdf");
    for (const c of german) {
      const r = await run(c);
      expect(r.packs, `${c.file} packs`).toContain("de");
    }
  });

  it("names German outright once there is prose to go on", async () => {
    const prose = [
      "2024-014.pdf",
      "angebot_2024.pdf",
      "arbeitsvertrag.pdf",
      "mietvertrag_wohnung.pdf",
      "anschreiben.pdf",
    ];
    for (const file of prose) {
      const r = await run(CASES.find((x) => x.file === file)!);
      expect(r.language, `${file} language`).toBe("de");
    }
  });

  it("keeps a mostly-English document on the English pack", async () => {
    const r = await run(CASES[CASES.length - 1]);
    expect(r.language).toBe("en");
    expect(r.packs).toEqual(["en"]);
  });

  it("reaches trusted confidence on the clearest German documents", async () => {
    // The point of a pack is skipping the AI engine, which needs "high". If this
    // drops, the pack is costing bandwidth without saving a run.
    const clear = [
      "2024-014.pdf",
      "lieferschein_8841.pdf",
      "lebenslauf_seibold.pdf",
    ];
    for (const file of clear) {
      const c = CASES.find((x) => x.file === file)!;
      const r = await run(c);
      expect(r.confidence, `${file} confidence`).toBe("high");
    }
  });
});
