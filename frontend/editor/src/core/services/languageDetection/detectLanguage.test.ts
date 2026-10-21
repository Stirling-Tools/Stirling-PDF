import { describe, expect, it } from "vitest";

import { detectLanguage } from "@app/services/languageDetection/detectLanguage";

const ENGLISH =
  "This agreement is made between the parties and shall be governed by the laws " +
  "of England. The tenant agrees to pay the rent that is due under this contract " +
  "for the property.";

const SPANISH =
  "CONTRATO DE ARRENDAMIENTO DE VIVIENDA. Este contrato de arrendamiento se " +
  "celebra entre el arrendador y el arrendatario para la vivienda situada en la " +
  "ciudad. El arrendatario pagara una renta mensual de 1150 euros segun las " +
  "condiciones que las partes acuerdan por el plazo de doce meses.";

const FRENCH =
  "Ce contrat de location est conclu entre le bailleur et le locataire pour le " +
  "logement situe dans la ville. Le locataire paiera un loyer mensuel de mille " +
  "euros selon les conditions convenues par les parties pour une duree de douze " +
  "mois.";

const GERMAN =
  "Dieser Mietvertrag wird zwischen dem Vermieter und dem Mieter für die Wohnung " +
  "in der Stadt geschlossen. Der Mieter zahlt eine monatliche Miete von eintausend " +
  "Euro nach den Bedingungen, die die Parteien für die Dauer von zwölf Monaten " +
  "vereinbaren.";

const PORTUGUESE =
  "Este contrato de arrendamento é celebrado entre o senhorio e o arrendatário " +
  "para a habitação situada na cidade. O arrendatário pagará uma renda mensal de " +
  "mil euros segundo as condições que as partes acordam pelo prazo de doze meses.";

const ITALIAN =
  "Questo contratto di locazione è concluso tra il locatore e il conduttore per " +
  "l'abitazione situata nella città. Il conduttore pagherà un canone mensile di " +
  "mille euro secondo le condizioni concordate dalle parti per la durata di dodici " +
  "mesi.";

const CHINESE =
  "本租赁合同由出租人与承租人就位于城市的房屋订立。承租人应按照双方约定的条件，" +
  "每月支付租金一千元，租赁期限为十二个月。双方同意本合同受当地法律管辖。";

const JAPANESE =
  "この賃貸借契約は、都市にある住宅について、賃貸人と賃借人の間で締結される。" +
  "賃借人は、当事者が合意した条件に従い、毎月千円の家賃を支払うものとする。" +
  "契約期間は十二か月とする。";

const RUSSIAN =
  "Настоящий договор аренды заключается между арендодателем и арендатором в " +
  "отношении жилого помещения, расположенного в городе. Арендатор обязуется " +
  "выплачивать ежемесячную арендную плату в размере тысячи рублей на условиях, " +
  "согласованных сторонами, в течение двенадцати месяцев.";

const ARABIC =
  "يُبرم عقد الإيجار هذا بين المالك والمستأجر بشأن المسكن الواقع في المدينة. " +
  "يلتزم المستأجر بدفع إيجار شهري قدره ألف ريال وفقاً للشروط التي اتفق عليها " +
  "الطرفان لمدة اثني عشر شهراً.";

describe("detectLanguage", () => {
  it.each([
    ["English", ENGLISH, "en"],
    ["Spanish", SPANISH, "es"],
    ["French", FRENCH, "fr"],
    ["German", GERMAN, "de"],
    ["Portuguese", PORTUGUESE, "pt"],
    ["Italian", ITALIAN, "it"],
    ["Chinese", CHINESE, "zh"],
    ["Japanese", JAPANESE, "ja"],
    ["Russian", RUSSIAN, "ru"],
    ["Arabic", ARABIC, "ar"],
  ])("identifies %s prose", (_name, text, expected) => {
    expect(detectLanguage(text).language).toBe(expected);
  });

  it("marks text too short to judge instead of guessing", () => {
    const result = detectLanguage("12.50 48.00");
    expect(result.language).toBeNull();
    expect(result.lowText).toBe(true);
  });

  it("does not call a short English label a confident detection", () => {
    const result = detectLanguage("Invoice");
    expect(result.language).toBeNull();
    expect(result.lowText).toBe(true);
  });

  it("marks English reached by absence of foreign evidence as assumed", () => {
    const result = detectLanguage(
      "Quick brown foxes jump over lazy dogs while running away.",
    );
    expect(result.language).toBe("en");
    expect(result.assumed).toBe(true);
  });
});
