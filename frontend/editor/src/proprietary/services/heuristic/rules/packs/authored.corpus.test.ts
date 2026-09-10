// Accuracy gate for the hand-authored packs. One realistic specimen per document
// type per language, asserted on the real engine: the label, and that the clearest
// ones reach "high" — which is the whole point of field vocabulary, since "high"
// needs three distinct signals and a document-type name is only one.

import { describe, expect, it } from "vitest";
import { classifyHeuristic } from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

interface Case {
  lang: string;
  expect: string;
  file: string;
  title: string;
  body: string[];
  pages?: number;
  /** Assert the verdict is trusted enough to skip the AI engine. */
  trusted?: boolean;
}

const run = async (c: Case) => {
  const body = c.body.join("\n");
  const doc: HeuristicDoc = {
    fileName: c.file,
    pageCount: c.pages ?? 1,
    meta: {},
    titleZone: c.title,
    firstZone: body,
    allZone: body,
  };
  return classifyHeuristic(doc, { localeHint: c.lang });
};

const CASES: Case[] = [
  {
    lang: "fr",
    expect: "invoice",
    file: "facture_2024_014.pdf",
    trusted: true,
    title: "Facture",
    body: [
      "Facture",
      "Atelier Mills, 14 rue des Fougères, 33000 Bordeaux",
      "Numéro de facture : 2024-014    Date de facture : 3 mai 2024",
      "Client : Café du Port SARL",
      "Refonte du logo et charte graphique       950,00",
      "Total HT 1 000,00   TVA 20% 200,00   Total TTC 1 200,00",
      "Net à payer : 1 200,00 EUR",
      "Conditions de paiement : règlement à réception de facture.",
    ],
  },
  {
    lang: "fr",
    expect: "payslip",
    file: "bulletin_mai.pdf",
    trusted: true,
    title: "Bulletin de paie",
    body: [
      "Bulletin de paie - mai 2024",
      "Matricule 4418   Emploi : Chef de projet",
      "Salaire brut 4 100,00",
      "Cotisations sociales 892,30   URSSAF 612,33",
      "Net imposable 3 207,70",
      "Net à payer 2 498,44",
    ],
  },
  {
    lang: "fr",
    expect: "quote",
    file: "devis_2024.pdf",
    title: "Devis",
    body: [
      "Devis",
      "Numéro de devis : A-2024-0042",
      "Madame, Monsieur, nous vous remercions de votre demande.",
      "Réfection de l'allée, travaux de pavage selon métré   4 800,00",
      "Ce devis est valable jusqu'au 31 mars 2024.",
    ],
  },
  {
    lang: "es",
    expect: "invoice",
    file: "factura_2024.pdf",
    trusted: true,
    title: "Factura",
    body: [
      "Factura",
      "Mills Diseño S.L., Calle Fuentes 14, 28001 Madrid   CIF B12345678",
      "Número de factura: 2024-014   Fecha de factura: 3 de mayo de 2024",
      "Rediseño del logotipo y manual de marca      950,00",
      "Base imponible 1.000,00   IVA 21% 210,00",
      "Total a pagar: 1.210,00 EUR",
      "Forma de pago: transferencia. Fecha de vencimiento: 2 de junio de 2024.",
    ],
  },
  {
    lang: "es",
    expect: "payslip",
    file: "nomina_mayo.pdf",
    trusted: true,
    title: "Nómina",
    body: [
      "Nómina - mayo 2024",
      "Trabajador: Ana Reyes   Categoría: Técnico",
      "Salario bruto 3.200,00   Devengos totales 3.200,00",
      "Seguridad social 203,20   IRPF 384,00",
      "Líquido a percibir 2.612,80",
    ],
  },
  {
    lang: "es",
    expect: "delivery-note",
    file: "albaran_8841.pdf",
    title: "Albarán de entrega",
    body: [
      "Albarán de entrega número 8841",
      "Dirección de entrega: Carpintería Vega, Calle Mayor 12, Valladolid",
      "Tableros de roble 24 mm, 40 unidades",
      "Rogamos comprueben la mercancía a la recepción.",
    ],
  },
  {
    lang: "it",
    expect: "invoice",
    file: "fattura_2024.pdf",
    trusted: true,
    title: "Fattura",
    body: [
      "Fattura",
      "Mills Design S.r.l., Via Fernо 14, 20121 Milano   Partita IVA 01234567890",
      "Numero fattura: 2024-014   Data fattura: 3 maggio 2024",
      "Rifacimento del logo e linee guida del marchio     950,00",
      "Imponibile 1.000,00   IVA 22% 220,00",
      "Totale fattura 1.220,00 EUR",
      "Modalità di pagamento: bonifico. Scadenza 2 giugno 2024.",
    ],
  },
  {
    lang: "it",
    expect: "payslip",
    file: "busta_paga.pdf",
    trusted: true,
    title: "Busta paga",
    body: [
      "Busta paga - maggio 2024",
      "Dipendente: Marco Ferri   Livello: 5   CCNL Commercio",
      "Retribuzione lorda 3.100,00",
      "Contributi INPS 287,00   IRPEF 540,00",
      "Netto in busta 2.273,00",
    ],
  },
  {
    lang: "it",
    expect: "bank-statement",
    file: "estratto_conto.pdf",
    pages: 2,
    title: "Estratto conto",
    body: [
      "Estratto conto numero 7 - luglio 2024",
      "Numero conto IT02 X123 0000 0000 2020 51",
      "Saldo iniziale 4.218,77",
      "Data valuta   Operazione                        Importo",
      "02/07         Bonifico affitto               -1.050,00",
      "05/07         Stipendio luglio                3.240,18",
      "Saldo finale 6.346,52",
    ],
  },
  {
    lang: "pt",
    expect: "invoice",
    file: "fatura_2024.pdf",
    trusted: true,
    title: "Fatura",
    body: [
      "Fatura",
      "Mills Design Lda, Rua das Fontes 14, 1050 Lisboa   NIF 501234567",
      "Número da fatura: 2024-014   Data de emissão: 3 de maio de 2024",
      "Redesenho do logótipo e manual de marca      950,00",
      "Valor total 1.230,00 EUR   IVA 23% 230,00",
      "Total a pagar: 1.230,00",
      "Forma de pagamento: transferência. Data de vencimento: 2 de junho.",
    ],
  },
  {
    lang: "pt",
    expect: "payslip",
    file: "recibo_vencimento.pdf",
    trusted: true,
    title: "Recibo de vencimento",
    body: [
      "Recibo de vencimento - maio 2024",
      "Trabalhador: Rui Matos   Categoria: Técnico",
      "Salário bruto 2.400,00",
      "Descontos: INSS 264,00   IRS 312,00",
      "Valor líquido 1.824,00",
    ],
  },
  {
    lang: "pt",
    expect: "resume",
    file: "cv_matos.pdf",
    pages: 2,
    title: "Curriculum Vitae",
    body: [
      "Curriculum Vitae",
      "Rui Matos, nascido em 4 de setembro de 1989 em Coimbra",
      "Experiência profissional",
      "2019 até hoje, gestor de projeto na Nordlicht Media Lda",
      "Formação académica: licenciatura em Gestão, Universidade de Lisboa",
      "Competências: gestão de equipas, orçamentação, inglês fluente",
    ],
  },
  {
    lang: "nl",
    expect: "invoice",
    file: "factuur_2024.pdf",
    trusted: true,
    title: "Factuur",
    body: [
      "Factuur",
      "Mills Ontwerp BV, Fernweg 14, 1011 AB Amsterdam",
      "BTW-nummer NL001234567B01",
      "Factuurnummer: 2024-014   Factuurdatum: 3 mei 2024",
      "Vernieuwing van het logo en de merkrichtlijnen      950,00",
      "Bedrag excl. BTW 1.000,00   BTW 21% 210,00",
      "Totaalbedrag 1.210,00 EUR   Te betalen voor vervaldatum 2 juni 2024",
    ],
  },
  {
    lang: "nl",
    expect: "payslip",
    file: "loonstrook_mei.pdf",
    trusted: true,
    title: "Loonstrook",
    body: [
      "Loonstrook mei 2024",
      "Medewerker: Sanne de Vries   Functie: Projectleider",
      "Brutoloon 3.600,00   Vakantiegeld 288,00",
      "Loonheffing 842,00",
      "Nettoloon 2.758,00",
    ],
  },
  {
    lang: "nl",
    expect: "quote",
    file: "offerte_2024.pdf",
    title: "Offerte",
    body: [
      "Offerte",
      "Geachte mevrouw Jansen, hartelijk dank voor uw aanvraag.",
      "Wij doen u graag de volgende prijsopgave voor het vernieuwen van de oprit.",
      "Bestratingswerk volgens opmeting      4.800,00",
      "Deze offerte is geldig tot 31 maart 2024.",
    ],
  },
  {
    lang: "pl",
    expect: "invoice",
    file: "faktura_2024.pdf",
    trusted: true,
    title: "Faktura VAT",
    body: [
      "Faktura VAT",
      "Mills Design sp. z o.o., ul. Fernweg 14, 00-001 Warszawa   NIP 1234567890",
      "Numer faktury: 2024-014   Data wystawienia: 3 maja 2024",
      "Nabywca: Harbour Cafe sp. z o.o.",
      "Przebudowa logotypu i wytycznych marki       950,00",
      "Razem do zapłaty: 1 230,00 PLN",
      "Termin płatności: 2 czerwca 2024. Sposób płatności: przelew.",
    ],
  },
  {
    lang: "pl",
    expect: "employment-contract",
    file: "umowa_o_prace.pdf",
    pages: 5,
    title: "Umowa o pracę",
    body: [
      "Umowa o pracę",
      "zawarta między Nordlicht Media sp. z o.o. a panią Katarzyną Sobol",
      "Strony umowy ustalają wymiar czasu pracy na pełny etat.",
      "Pierwsze trzy miesiące stanowią okres próbny.",
      "Urlop wypoczynkowy wynosi dwadzieścia sześć dni w roku kalendarzowym.",
      "Wypowiedzenie następuje zgodnie z kodeksem pracy.",
    ],
  },
  {
    lang: "pl",
    expect: "bank-statement",
    file: "wyciag_bankowy.pdf",
    pages: 2,
    title: "Wyciąg bankowy",
    body: [
      "Wyciąg bankowy numer 7 za lipiec 2024",
      "Numer rachunku PL02 1203 0000 0000 2020 51",
      "Saldo początkowe 4 218,77",
      "Data księgowania   Operacja                     Kwota",
      "02.07              Przelew czynsz            -1 050,00",
      "05.07              Wynagrodzenie              3 240,18",
      "Saldo końcowe 6 346,52",
    ],
  },
];

describe("hand-authored pack corpus", () => {
  it.each(CASES.map((c) => [`${c.lang} ${c.expect}`, c] as const))(
    "labels a %s correctly",
    async (_label, c) => {
      const r = await run(c);
      const detail = `got [${r.labels.join(", ")}] (language ${r.language ?? "?"}, packs [${r.packs.join(", ")}], ${r.confidence}, score ${r.score})`;
      expect(r.labels[0], detail).toBe(c.expect);
      if (c.trusted) expect(r.confidence, detail).toBe("high");
    },
  );

  it("detects each document's own language", async () => {
    for (const c of CASES) {
      const r = await run(c);
      expect(r.packs, `${c.file} packs`).toContain(c.lang);
    }
  });
});
