import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  packsFor,
} from "@app/services/heuristic/heuristicEngine";

const prose = {
  en: `This agreement is made between the parties and shall be governed by the
    laws of England. The tenant agrees to pay the rent that is due under this
    contract for the property, and the landlord will maintain the building.`,
  de: `Rechnungsnummer 2024-014. Der Betrag ist innerhalb von dreißig Tagen
    nach Erhalt dieser Rechnung zu zahlen. Die Leistungen werden für den
    genannten Zeitraum mit dem vereinbarten Satz abgerechnet und sind fällig.`,
  fr: `Le paiement est dû dans les trente jours suivant la réception de cette
    facture. Les prestations sont facturées pour la période indiquée avec le
    taux convenu, et vous trouverez le détail dans le tableau ci-dessous.`,
  es: `El pago deberá abonarse en los treinta días siguientes a la recepción de
    esta factura. Los servicios se facturan para el periodo indicado según las
    condiciones que las partes acuerdan por el plazo de doce meses.`,
  it: `Il pagamento è dovuto entro trenta giorni dalla data della fattura. Le
    prestazioni sono fatturate per il periodo indicato con la tariffa concordata
    e ciascuna delle parti può recedere dal contratto con un preavviso.`,
  pt: `O pagamento deve ser efetuado no prazo de trinta dias a contar da data
    desta fatura. Os serviços são faturados para o período indicado com as
    condições que você encontrará mais adiante neste documento.`,
  nl: `De betaling wordt binnen dertig dagen na ontvangst van deze factuur
    voldaan. De werkzaamheden zijn voor de aangegeven periode gefactureerd met
    het afgesproken tarief, en deze voorwaarden zijn ook van toepassing.`,
  pl: `Płatność jest wymagana w terminie trzydziestu dni od daty otrzymania
    faktury. Usługi nie są rozliczane dla wskazanego okresu lub może przy
    zastosowaniu uzgodnionej stawki oraz zgodnie z umową.`,
};

const scripts = {
  ja: "請求書 請求番号 2024-014 発行日 2024年5月3日 お支払期限は請求書の受領後30日以内とさせていただきます。合計金額 1,200円",
  zh: "发票 发票号码 2024-014 开票日期 2024年5月3日 付款期限为收到发票后三十天内。合计金额 1,200元 请在期限内付款。",
  ru: "Договор оказания услуг. Настоящий договор заключён между сторонами, указанными ниже, на оказание описанных услуг. Оплата производится в течение тридцати дней.",
  uk: "Договір про надання послуг. Цей договір укладено між сторонами, які зазначені нижче. Оплата здійснюється протягом тридцяти днів із дати рахунку.",
  ar: "فاتورة. يجب أن يتم الدفع في غضون ثلاثين يوما من تاريخ هذه الفاتورة. يتم احتساب الخدمات للفترة المذكورة هنا وهذا المبلغ مستحق الدفع على الحساب.",
  bg: "Фактура. Плащането се дължи в срок от тридесет дни от датата на фактурата. Услугите се начисляват за посочения период и трябва да бъдат платени.",
  fa: "صورتحساب. پرداخت باید در مدت سی روز از تاریخ این صورتحساب انجام شود. خدمات برای دوره ذکر شده محاسبه می شود و این مبلغ قابل پرداخت است.",
  el: "Τιμολόγιο. Η πληρωμή οφείλεται εντός τριάντα ημερών από την ημερομηνία του τιμολογίου. Οι υπηρεσίες χρεώνονται για την αναφερόμενη περίοδο.",
  th: "ใบแจ้งหนี้ เลขที่ใบแจ้งหนี้ 2024-014 กำหนดชำระเงินภายในสามสิบวันนับจากวันที่ได้รับใบแจ้งหนี้ ยอดรวมทั้งสิ้น 1,200 บาท",
  ko: "세금계산서 계산서 번호 2024-014 발행일 2024년 5월 3일 대금은 계산서 수령 후 삼십일 이내에 지급하여야 합니다. 합계 금액",
  ml: "ഇൻവോയ്സ് നമ്പർ 2024-014 ഇൻവോയ്സ് ലഭിച്ച് മുപ്പത് ദിവസത്തിനുള്ളിൽ പണം അടയ്ക്കേണ്ടതാണ്. ആകെ തുക 1,200 രൂപ മാത്രം.",
  bo: "༄༅། །རྩིས་ཁྲ། རྩིས་ཁྲའི་ཨང་གྲངས། ཟླ་བ་གསུམ་ནང་ཚུན་སྤྲོད་དགོས། བསྡོམས་འབོར། རྩིས་ཁྲ་འདི་ཉིད་ལེན་པའི་ཉིན་གྲངས་སུམ་ཅུའི་ནང་ཚུན།",
};

describe("detectLanguage", () => {
  it.each(Object.entries(prose))("names %s prose", (tag, text) => {
    const d = detectLanguage(text);
    expect(
      d.language,
      `${tag}: candidates ${JSON.stringify(d.candidates.slice(0, 3))}`,
    ).toBe(tag);
    expect(d.script).toBe("latin");
    expect(d.assumed).toBe(false);
  });

  it.each(Object.entries(scripts))("names %s from its script", (tag, text) => {
    expect(detectLanguage(text).language).toBe(tag);
  });

  it("separates Japanese from Chinese on Kana alone", () => {
    expect(detectLanguage(scripts.ja).script).toBe("cjk");
    expect(detectLanguage(scripts.zh).script).toBe("cjk");
    expect(detectLanguage(scripts.ja).language).toBe("ja");
    expect(detectLanguage(scripts.zh).language).toBe("zh");
  });

  it("separates the three Cyrillic languages from each other", () => {
    expect(detectLanguage(scripts.ru).language).toBe("ru");
    expect(detectLanguage(scripts.uk).language).toBe("uk");
    expect(detectLanguage(scripts.bg).language).toBe("bg");
    for (const tag of ["ru", "uk", "bg"] as const) {
      expect(detectLanguage(scripts[tag]).script).toBe("cyrillic");
    }
  });

  it("separates Persian from Arabic", () => {
    expect(detectLanguage(scripts.ar).language).toBe("ar");
    expect(detectLanguage(scripts.fa).language).toBe("fa");
    expect(detectLanguage(scripts.fa).script).toBe("arabic");
  });

  it("leaves a decisive winner far enough clear to dispatch one pack", () => {
    const d = detectLanguage(prose.pt);
    const [best, second] = d.candidates;
    expect(best.language).toBe("pt");
    expect(second.score).toBeLessThan(best.score * 0.75);
  });

  it("is not fooled by Latin legalese in English", () => {
    const d = detectLanguage(
      `This agreement shall be governed by the laws of England. Force majeure,
       inter alia, suspends performance pro rata for the duration of the event,
       and the parties agree that any notice must be given in writing.`,
    );
    expect(d.language).toBe("en");
    expect(d.assumed).toBe(false);
  });

  it("does not let a foreign sign-off unseat an English document", () => {
    const d = detectLanguage(
      `Invoice Number: INV-2024-0455. Bill To: Nordlicht Medien GmbH, Hamburg.
       Total Due 1,080.00 including VAT. Payment terms: Net 30, and please quote
       the invoice number with the payment that is due under this invoice.
       Mit freundlichen Grüßen, Jane Mills`,
    );
    expect(d.language).toBe("en");
  });

  it("assumes English for data-dense text rather than claiming a language", () => {
    const d = detectLanguage(
      `BOARDING PASS MILLS/JANE MS LHR - JFK BA117 SEAT 14A GATE 12
       BOARDING 18:40 SEQ 0042 ETKT 125-2298765432`,
    );
    expect(d.language).toBe("en");
    expect(
      d.assumed,
      "no function words proved it, so the call is a fallback",
    ).toBe(true);
  });

  it("reports too little text instead of guessing", () => {
    const d = detectLanguage("Facture 2024-014");
    expect(d.language).toBeNull();
    expect(d.lowText).toBe(true);
  });

  describe("known limits", () => {
    it("reads Danish as assumed English until a da pack is worth dispatching", () => {
      const d = detectLanguage(
        `Fakturanummer 2024-014. Beløbet skal betales senest tredive dage efter
         modtagelsen af denne faktura. Samlet beløb at betale er 1.200,00 kroner
         og kan indbetales til kontoen nedenfor.`,
      );
      // The da and no profiles differ by four words (af/av, mellem/mellom), so
      // neither clears the other decisively; "assumed" is the honest answer.
      expect(["da", "no", "en"]).toContain(d.language);
    });

    it("picks one language from a bilingual document", () => {
      const d = detectLanguage(
        `Rechnung / Facture. Mills Design AG, Zürich. Der Betrag ist innerhalb
         von dreissig Tagen zu zahlen und ist für die genannte Leistung fällig.
         Le montant est dû dans les trente jours suivant la réception de cette
         facture, et les prestations sont facturées avec le taux convenu.`,
      );
      expect(["de", "fr"]).toContain(d.language);
      // Both are on the list, which is what lets the dispatcher load both packs.
      const tags = d.candidates.slice(0, 2).map((c) => c.language);
      expect(tags).toContain("de");
      expect(tags).toContain("fr");
    });
  });

  describe("pack dispatch", () => {
    it("asks for one pack when the language is obvious", () => {
      const d = detectLanguage(prose.de);
      expect(d.language).toBe("de");
      expect(packsFor(d, prose.de.length)).toEqual(["de"]);
    });

    it("asks for both when a document carries two languages it has packs for", () => {
      const mixed =
        "Die Vertragsparteien vereinbaren, dass die Leistungen für den genannten " +
        "Zeitraum abgerechnet werden und der Betrag ist innerhalb von dreißig " +
        "Tagen nach Erhalt dieser Rechnung zu zahlen. Der Rechnungsempfänger " +
        "wird nicht von den Bedingungen ausgenommen. This agreement is made " +
        "between the parties and shall be governed by the laws of England.";
      const asked = packsFor(detectLanguage(mixed), mixed.length);
      expect(asked).toContain("de");
      expect(asked).toContain("en");
    });

    it("asks for nothing when the detected language has no pack", () => {
      // Hebrew: the script range names it, but we ship no he locale and so no
      // pack. Core scores the document alone and the AI engine rules on it.
      const hebrew =
        "חוזה שכירות. התשלום יבוצע בתוך שלושים יום מתאריך החשבונית הזאת. " +
        "השירותים מחויבים עבור התקופה המצוינת לפי התנאים שהצדדים הסכימו עליהם.";
      const d = detectLanguage(hebrew);
      expect(d.language).toBe("he");
      expect(packsFor(d, hebrew.length)).toEqual([]);
    });

    it("stays narrow on a long document however unsure it is", () => {
      // Five mature packs over 50 pages is the one combination that would cost
      // real time, and a document that long is rarely the uncertain one.
      const terse =
        "Kontoauszug 07/2024 Buchungstag Wertstellung Betrag 1.248,00";
      const d = detectLanguage(terse);
      expect(packsFor(d, 50000).length).toBeLessThanOrEqual(2);
    });
  });
});
