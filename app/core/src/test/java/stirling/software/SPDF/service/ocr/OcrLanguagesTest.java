package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

class OcrLanguagesTest {

    @Test
    void chineseAndJapaneseGoFirstAndTheRestKeepTheirOrder() {
        assertEquals(
                List.of("chi_sim", "jpn_vert", "eng", "fra"),
                OcrLanguages.cjkFirst(List.of("eng", "chi_sim", "fra", "jpn_vert")));
        assertEquals(List.of("deu", "eng"), OcrLanguages.cjkFirst(List.of("deu", "eng")));
    }
}
