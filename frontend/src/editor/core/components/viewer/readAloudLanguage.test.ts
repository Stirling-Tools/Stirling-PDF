// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  detectLanguageFromText,
  languageFromMetadata,
} from "@editor/components/viewer/readAloudLanguage";

function metadata(values: Record<string, unknown>) {
  return {
    get(name: string): unknown {
      return values[name] ?? null;
    },
  };
}

describe("detectLanguageFromText", () => {
  it("detects Russian", () => {
    expect(
      detectLanguageFromText(
        "Русский язык — это восточнославянский язык, который является официальным языком Российской Федерации. На русском языке говорят миллионы людей в России и за её пределами. Это богатый язык с долгой историей, литературой и культурой.",
      ),
    ).toBe("ru-RU");
  });

  it("detects Ukrainian rather than Russian", () => {
    expect(
      detectLanguageFromText(
        "Українська мова — це східнослов'янська мова, яка є офіційною мовою України. Нею розмовляють мільйони людей в Україні та за її межами. Це багата мова з давньою історією, літературою та культурою.",
      ),
    ).toBe("uk-UA");
  });

  it("detects simplified and traditional Chinese", () => {
    expect(
      detectLanguageFromText(
        "简体中文是中文的一种标准书写形式，主要在中国大陆、新加坡和马来西亚使用。它使用简化字，笔画较少，便于学习和书写。中文是世界上使用人数最多的语言之一，拥有悠久的历史和丰富的文化。",
      ),
    ).toBe("zh-CN");
    expect(
      detectLanguageFromText(
        "這個語言使用繁體字，許多人在臺灣、香港和澳門說這種語言。它擁有豐富的歷史和文化，學習者可以從中了解中國文學。",
      ),
    ).toBe("zh-TW");
  });

  it("detects Japanese when kana accompany Han text", () => {
    expect(
      detectLanguageFromText(
        "日本語は日本の公用語であり、多くの人々によって話されています。ひらがな、カタカナ、漢字を使って文章を書きます。日本語の文学は長い歴史を持ち、世界中で読まれています。",
      ),
    ).toBe("ja-JP");
  });

  it("detects Korean", () => {
    expect(
      detectLanguageFromText(
        "한국어는 대한민국의 공용어이며, 많은 사람들이 사용합니다. 한글은 과학적인 문자로 알려져 있습니다. 한국어에는 다양한 방언이 있지만 표준어를 사용합니다.",
      ),
    ).toBe("ko-KR");
  });

  it("detects Arabic and Persian", () => {
    expect(
      detectLanguageFromText(
        "اللغة العربية هي لغة رسمية في العديد من الدول العربية. يتحدث بها ملايين الناس في الشرق الأوسط وشمال أفريقيا. وهي لغة غنية بالتاريخ والأدب والثقافة.",
      ),
    ).toBe("ar-AR");
    expect(
      detectLanguageFromText(
        "زبان فارسی یکی از زبان‌های هندواروپایی است که در ایران، افغانستان و تاجیکستان صحبت می‌شود. این زبان دارای تاریخ و ادبیات غنی است و میلیون‌ها گویشور دارد.",
      ),
    ).toBe("fa-IR");
  });

  it("detects Greek, Hindi and Thai", () => {
    expect(
      detectLanguageFromText(
        "Η ελληνική γλώσσα είναι μια από τις αρχαιότερες γλώσσες του κόσμου. Μιλιέται στην Ελλάδα και την Κύπρο και έχει πλούσια ιστορία και πολιτισμό.",
      ),
    ).toBe("el-GR");
    expect(
      detectLanguageFromText(
        "हिन्दी भारत की सबसे अधिक बोली जाने वाली भाषा है। यह भारत के अनेक राज्यों में बोली जाती है और इसका समृद्ध साहित्य है।",
      ),
    ).toBe("hi-IN");
    expect(
      detectLanguageFromText(
        "ภาษาไทยเป็นภาษาราชการของประเทศไทย มีผู้พูดหลายล้านคนทั่วโลก ภาษาไทยมีอักษรของตนเองและวัฒนธรรมที่ยาวนาน",
      ),
    ).toBe("th-TH");
  });

  it("detects Latin-script languages", () => {
    expect(
      detectLanguageFromText(
        "Le français est une langue romane parlée dans de nombreux pays. Les gens qui parlent cette langue sont appelés francophones. C'est une langue riche avec une longue histoire et une culture variée.",
      ),
    ).toBe("fr-FR");
    expect(
      detectLanguageFromText(
        "Deutsch ist eine germanische Sprache, die in Deutschland, Österreich und der Schweiz gesprochen wird. Die deutsche Sprache hat eine lange Geschichte und eine reiche Kultur. Viele Menschen lernen Deutsch als Fremdsprache.",
      ),
    ).toBe("de-DE");
    expect(
      detectLanguageFromText(
        "El español es una lengua romance que se habla en muchos países. Las personas que hablan español se llaman hispanohablantes. Es una lengua rica con una larga historia y una cultura diversa.",
      ),
    ).toBe("es-ES");
    expect(
      detectLanguageFromText(
        "O português é uma língua românica falada em Portugal, no Brasil e em outros países. As pessoas que falam português são chamadas lusófonas. É uma língua rica em história e cultura.",
      ),
    ).toBe("pt-PT");
    expect(
      detectLanguageFromText(
        "L'italiano è una lingua romanza parlata in Italia e in altri paesi. Le persone che parlano italiano sono chiamate italofoni. È una lingua ricca di storia e cultura.",
      ),
    ).toBe("it-IT");
  });

  it("detects Polish, Turkish and Vietnamese", () => {
    expect(
      detectLanguageFromText(
        "Język polski jest językiem zachodniosłowiańskim, którym posługują się miliony ludzi w Polsce i na świecie. Jest to język o bogatej historii i kulturze, który ma wiele dialektów.",
      ),
    ).toBe("pl-PL");
    expect(
      detectLanguageFromText(
        "Türkçe, Türkiye'nin resmi dilidir ve dünyada milyonlarca insan tarafından konuşulmaktadır. Türkçe, zengin bir tarihe ve kültüre sahip bir dildir. Türkçe öğrenmek için çok fazla kaynak vardır ve bu dil daha kolay öğrenilebilir.",
      ),
    ).toBe("tr-TR");
    expect(
      detectLanguageFromText(
        "Tiếng Việt là ngôn ngữ chính thức của Việt Nam. Đây là một ngôn ngữ có thanh điệu và hệ thống chữ viết riêng. Nhiều người trên thế giới đang học tiếng Việt để làm việc và du lịch.",
      ),
    ).toBe("vi-VN");
  });

  it("does not claim English or an uncertain sample", () => {
    expect(
      detectLanguageFromText(
        "The quick brown fox jumps over the lazy dog. This is a test document written in English. It contains common words such as the, and, of, to, in, is, that, for, it, with, as, was, on, be, at, by, this, have, from, or, not, but, what, all, were, when, we, there, can, your, which, their, will, about, how, they, would, other, has, more, been, its, who, now, people, over, only, may, just, where, know, through, much, before, good, new, also, because, does.",
      ),
    ).toBeNull();
    expect(
      detectLanguageFromText(
        "ACME Corporation Invoice 2026. Total due: 1200 EUR. Thank you.",
      ),
    ).toBeNull();
    expect(detectLanguageFromText("")).toBeNull();
    expect(detectLanguageFromText("1234 5678 90")).toBeNull();
  });

  it("returns null for a script with no supported speech language", () => {
    expect(
      detectLanguageFromText(
        "שלום עולם זהו טקסט לבדיקה בשפה העברית עם מילים רבות ומשפטים שלמים.",
      ),
    ).toBeNull();
  });
});

describe("languageFromMetadata", () => {
  it("maps declared tags onto the selector's codes", () => {
    expect(languageFromMetadata(metadata({ "dc:language": "ru-RU" }))).toBe(
      "ru-RU",
    );
    expect(languageFromMetadata(metadata({ "dc:language": "de-AT" }))).toBe(
      "de-DE",
    );
    expect(
      languageFromMetadata(metadata({ "dc:language": "zh-Hant-TW" })),
    ).toBe("zh-TW");
    expect(languageFromMetadata(metadata({ "dc:language": "zh-Hans" }))).toBe(
      "zh-CN",
    );
    expect(languageFromMetadata(metadata({ "dc:language": "pt-BR" }))).toBe(
      "pt-BR",
    );
    expect(languageFromMetadata(metadata({ "dc:language": "nb-NO" }))).toBe(
      "no-NB",
    );
  });

  it("accepts a list and rejects unsupported or malformed tags", () => {
    expect(
      languageFromMetadata(
        metadata({ "dc:language": ["und", "uk-UA", "ru-RU"] }),
      ),
    ).toBe("uk-UA");
    expect(
      languageFromMetadata(metadata({ "dc:language": "he-IL" })),
    ).toBeNull();
    expect(
      languageFromMetadata(metadata({ "dc:language": "not a language!" })),
    ).toBeNull();
    expect(languageFromMetadata(null)).toBeNull();
  });
});
