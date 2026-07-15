package stirling.software.proprietary.classification;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

/**
 * Heuristic (non-AI) document classifier. Pure string/regex/structural scoring over extracted page
 * text, filename and PDF metadata, keyed to the shared classification vocabulary. Faithful port of
 * the frontend {@code heuristicEngine.ts} so the non-AI classify path produces the same labels the
 * AI engine would write. Rules are loaded once from {@code classification/heuristic-rules.json}.
 */
@Slf4j
@Service
public class HeuristicClassifier {

    private static final String RULES_RESOURCE = "classification/heuristic-rules.json";

    // --- scoring constants (mirror heuristicEngine.ts) ---
    private static final Map<String, Double> ZONE_MULT =
            Map.of("title", 2.0, "first", 1.35, "any", 1.0);
    private static final double FLOOR = 18;
    private static final double HIGH_SCORE = 45, HIGH_MARGIN = 15;
    private static final int HIGH_SIGNALS = 3;
    private static final double MED_SCORE = 28, MED_MARGIN = 8;
    private static final double SEC_FLOOR = 28, SEC_FRAC = 0.5;
    private static final int SEC_SIGNALS = 2, SEC_MAX = 4;

    private static final Set<String> STOPWORDS =
            Set.of(
                    "the", "and", "of", "to", "in", "is", "that", "for", "on", "with", "as", "are",
                    "this", "be", "by", "at", "from", "or", "an", "not", "your", "you", "we", "has",
                    "have", "will", "was", "were", "been", "their", "they", "which", "any", "all",
                    "may", "shall", "if", "can", "our", "its", "it", "no", "but", "other", "than",
                    "these", "such", "must", "each", "per", "under", "more", "when", "also", "into",
                    "only", "should", "would");

    // Non-Latin scripts end English classification outright when they dominate.
    private static final Pattern[] SCRIPT_RANGES = {
        Pattern.compile("[一-鿿぀-ヿ]"), // CJK + Kana
        Pattern.compile("[가-힯ᄀ-ᇿ]"), // Hangul
        Pattern.compile("[Ѐ-ӿ]"), // Cyrillic
        Pattern.compile("[؀-ۿݐ-ݿ]"), // Arabic
        Pattern.compile("[Ͱ-Ϳ]"), // Greek
        Pattern.compile("[ऀ-ॿ]"), // Devanagari
        Pattern.compile("[֐-׿]"), // Hebrew
        Pattern.compile("[฀-๿]"), // Thai
    };

    private record LatinProfile(Set<String> words, Pattern dia) {}

    private static final List<LatinProfile> LATIN_PROFILES =
            List.of(
                    new LatinProfile(
                            Set.of("el", "los", "las", "que", "para", "una", "por", "según", "más"),
                            Pattern.compile("[áéíóúñ¿¡]")),
                    new LatinProfile(
                            Set.of(
                                    "le", "les", "des", "une", "est", "pour", "avec", "dans",
                                    "vous", "votre", "être", "nous", "cette", "sont", "été"),
                            Pattern.compile("[àâçèéêëîïôùûœ]")),
                    new LatinProfile(
                            Set.of(
                                    "der", "die", "das", "und", "ist", "für", "mit", "von", "nicht",
                                    "ein", "eine", "werden", "wird", "bei", "sind", "dem"),
                            Pattern.compile("[äöüß]")),
                    new LatinProfile(
                            Set.of(
                                    "il", "di", "che", "per", "con", "una", "del", "della", "sono",
                                    "questo", "essere", "più", "nel", "anche", "gli"),
                            Pattern.compile("[àèéìòù]")),
                    new LatinProfile(
                            Set.of(
                                    "os", "as", "que", "para", "com", "uma", "por", "são", "não",
                                    "você", "está", "mais"),
                            Pattern.compile("[ãõçáéíóúâêô]")),
                    new LatinProfile(
                            Set.of(
                                    "het", "een", "van", "voor", "met", "aan", "niet", "zijn",
                                    "wordt", "deze", "als", "bij", "ook", "naar"),
                            null),
                    new LatinProfile(
                            Set.of(
                                    "och", "att", "det", "som", "på", "är", "av", "för", "med",
                                    "den", "till", "inte", "har", "ett", "du"),
                            Pattern.compile("[åäö]")),
                    new LatinProfile(
                            Set.of(
                                    "nie", "jest", "się", "że", "oraz", "dla", "przez", "lub",
                                    "być", "może", "przy", "jak"),
                            Pattern.compile("[ąćęłńśźż]")),
                    new LatinProfile(
                            Set.of(
                                    "ve", "bir", "bu", "için", "ile", "olarak", "olan", "gibi",
                                    "daha", "çok", "her", "kadar", "sonra"),
                            Pattern.compile("[çğışöü]")));

    // detectEnglish helper patterns
    private static final Pattern LETTERS = Pattern.compile("\\p{L}");
    private static final Pattern LATIN_LETTER = Pattern.compile("[a-z]", Pattern.CASE_INSENSITIVE);
    private static final Pattern WORD = Pattern.compile("[\\p{L}']+");

    // structural signal patterns
    private static final Pattern CURRENCY =
            Pattern.compile(
                    "[$£€]\\s?\\d[\\d,.]*|\\d[\\d,.]*\\s?(usd|gbp|eur)\\b",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_TOKEN = Pattern.compile("^[\\d$£€.,%-]+$");
    private static final Pattern DIGIT = Pattern.compile("\\d");
    private static final Pattern FORM_LABEL =
            Pattern.compile("^[A-Za-z][A-Za-z /()&']{2,30}:\\s*$");
    private static final Pattern UNDERSCORE4 = Pattern.compile("_{4,}");
    private static final Pattern CHECKBOX = Pattern.compile("[☐☑□■]\\s");
    private static final Pattern DOT_LEADER = Pattern.compile("\\.{5,}\\s*\\d+\\s*$");
    private static final Pattern BULLET = Pattern.compile("^[•▪◦*-]\\s+\\S");
    private static final Pattern URL =
            Pattern.compile("https?://|www\\.", Pattern.CASE_INSENSITIVE);
    private static final Pattern TOC =
            Pattern.compile("table of contents", Pattern.CASE_INSENSITIVE);
    private static final Pattern SIG1 =
            Pattern.compile(
                    "\\b(signature|signed by|authorized signature|/s/)\\b",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern SIG2 =
            Pattern.compile("_{6,}\\s*\\n\\s*(date|name|sign)", Pattern.CASE_INSENSITIVE);
    private static final Pattern REF1 =
            Pattern.compile("\\b(references|bibliography)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern REF2 = Pattern.compile("\\[\\d{1,3}\\]|\\(\\d{4}\\)");
    private static final Pattern EMAIL_FROM =
            Pattern.compile(
                    "\\bfrom:\\s.+\\n(.*\\n){0,3}?\\s*(to|sent|date):\\s",
                    Pattern.CASE_INSENSITIVE);
    private static final Pattern EMAIL_SUBJ =
            Pattern.compile("subject:\\s", Pattern.CASE_INSENSITIVE);
    private static final Pattern ADDRESS =
            Pattern.compile("\\b\\d{5}(-\\d{4})?\\b|\\b[A-Z]{1,2}\\d{1,2}[A-Z]?\\s?\\d[A-Z]{2}\\b");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    // --- prepared rule model ---
    private record Phrase(String text, double weight, String where) {}

    private record Rx(Pattern re, double weight, String where) {}

    private record FileRx(Pattern re, double weight) {}

    private record MetaRx(String field, Pattern re, double weight) {}

    private record Negative(String text, Pattern re, double weight) {}

    private record Structural(String signal, double weight) {}

    private record PreparedLabel(
            String id,
            boolean emit,
            List<Phrase> phrases,
            List<Rx> regexes,
            List<FileRx> filenames,
            List<MetaRx> metadata,
            List<Negative> negatives,
            List<Structural> structural) {}

    /** Page-count prior: {@code min} required pages, {@code max} (nullable) preferred ceiling. */
    private record Prior(int min, Integer max) {}

    /** Input document for the heuristic engine. */
    public record HeuristicDoc(
            String fileName,
            int pageCount,
            Map<String, String> meta,
            String titleZone,
            String firstZone,
            String allZone) {}

    /** Classification outcome: emitted vocabulary label ids (primary first, capped at 5). */
    public record HeuristicResult(
            List<String> labels, String confidence, int score, boolean isEnglish) {

        /** True when the top match cleared the high-confidence bar (score, margin, signals). */
        public boolean isHighConfidence() {
            return "high".equals(confidence);
        }

        /** High confidence AND an emitted label — trustworthy enough to skip the AI engine. */
        public boolean isDefinitive() {
            return isHighConfidence() && !labels.isEmpty();
        }
    }

    private final List<PreparedLabel> prepared;
    private final Map<String, Prior> priors;

    public HeuristicClassifier() {
        JsonNode root = loadRules();
        this.prepared = prepare(root.path("labels"));
        this.priors = loadPriors(root.path("priors"));
        log.info(
                "Heuristic classifier loaded {} labels, {} page-count priors",
                prepared.size(),
                priors.size());
    }

    private static JsonNode loadRules() {
        try (InputStream in = new ClassPathResource(RULES_RESOURCE).getInputStream()) {
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load " + RULES_RESOURCE, e);
        }
    }

    // -----------------------------------------------------------------------
    // Preparation
    // -----------------------------------------------------------------------

    private static List<PreparedLabel> prepare(JsonNode labels) {
        List<PreparedLabel> out = new ArrayList<>();
        for (JsonNode label : labels) {
            String id = label.path("id").asText("");
            boolean emit = !label.path("emit").isBoolean() || label.path("emit").asBoolean();

            List<Phrase> phrases = new ArrayList<>();
            for (JsonNode p : label.path("phrases")) {
                String text = p.path("text").asText("");
                double w = p.path("weight").asDouble(0);
                if (text.isEmpty() || w <= 0) continue;
                phrases.add(new Phrase(normalize(text), Math.min(w, 40), where(p)));
            }

            List<Rx> regexes = new ArrayList<>();
            for (JsonNode r : label.path("regexes")) {
                Pattern re = compileRegex(r.path("pattern").asText(null), flags(r));
                if (re == null) continue;
                regexes.add(new Rx(re, Math.min(r.path("weight").asDouble(0), 30), where(r)));
            }

            List<FileRx> filenames = new ArrayList<>();
            for (JsonNode r : label.path("filenames")) {
                Pattern re = compileRegex(r.path("pattern").asText(null), flags(r));
                if (re == null) continue;
                filenames.add(new FileRx(re, Math.min(r.path("weight").asDouble(0), 30)));
            }

            List<MetaRx> metadata = new ArrayList<>();
            for (JsonNode r : label.path("metadata")) {
                Pattern re = compileRegex(r.path("pattern").asText(null), flags(r));
                if (re == null) continue;
                String field = r.path("field").asText("any");
                metadata.add(new MetaRx(field, re, Math.min(r.path("weight").asDouble(0), 20)));
            }

            List<Negative> negatives = new ArrayList<>();
            for (JsonNode n : label.path("negatives")) {
                String text = n.hasNonNull("text") ? normalize(n.path("text").asText()) : null;
                Pattern re =
                        n.hasNonNull("pattern")
                                ? compileRegex(n.path("pattern").asText(), flags(n))
                                : null;
                if (text == null && re == null) continue;
                negatives.add(
                        new Negative(
                                text, re, Math.min(Math.abs(n.path("weight").asDouble(0)), 30)));
            }

            List<Structural> structural = new ArrayList<>();
            for (JsonNode s : label.path("structural")) {
                String signal = s.path("signal").asText("");
                double w = s.path("weight").asDouble(0);
                if (signal.isEmpty() || w <= 0) continue;
                structural.add(new Structural(signal, Math.min(w, 12)));
            }

            out.add(
                    new PreparedLabel(
                            id,
                            emit,
                            phrases,
                            regexes,
                            filenames,
                            metadata,
                            negatives,
                            structural));
        }
        return out;
    }

    private static Map<String, Prior> loadPriors(JsonNode priorsNode) {
        Map<String, Prior> out = new HashMap<>();
        priorsNode
                .fields()
                .forEachRemaining(
                        e -> {
                            JsonNode arr = e.getValue();
                            if (!arr.isArray() || arr.isEmpty()) return;
                            int min = arr.get(0).asInt(0);
                            Integer max =
                                    arr.size() > 1 && !arr.get(1).isNull()
                                            ? arr.get(1).asInt()
                                            : null;
                            out.put(e.getKey(), new Prior(min, max));
                        });
        return out;
    }

    private static String where(JsonNode node) {
        String w = node.path("where").asText("");
        return w.isEmpty() ? "any" : w;
    }

    private static String flags(JsonNode node) {
        return node.path("flags").asText("");
    }

    /**
     * Compile a JS-authored rule regex to a Java {@link Pattern}, or null when it won't compile.
     */
    static Pattern compileRegex(String pattern, String flags) {
        if (pattern == null) return null;
        try {
            String fl = (flags == null || flags.isEmpty()) ? "gi" : flags;
            int f = 0;
            if (fl.indexOf('i') >= 0) f |= Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
            if (fl.indexOf('m') >= 0) f |= Pattern.MULTILINE;
            if (fl.indexOf('s') >= 0) f |= Pattern.DOTALL;
            return Pattern.compile(pattern, f);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Classify a document; returns emitted label ids (primary + secondaries, capped at 5). */
    public HeuristicResult classify(HeuristicDoc doc) {
        EnglishResult en = detectEnglish(doc.allZone());
        // Non-English with real text: honestly out of scope for the English heuristics.
        if (!en.isEnglish() && !en.lowText()) {
            return new HeuristicResult(List.of(), "none", 0, false);
        }

        String titleRaw = nz(doc.titleZone());
        String firstRaw = nz(doc.firstZone());
        String anyRaw = nz(doc.allZone());
        String titleNorm = normalize(titleRaw);
        String firstNorm = normalize(firstRaw);
        String anyNorm = normalize(anyRaw);
        String fileNameLower = nz(doc.fileName()).toLowerCase(Locale.ROOT);
        Map<String, String> meta = doc.meta() == null ? Map.of() : doc.meta();
        String metaAll = String.join(" \n ", meta.values());
        Map<String, Double> struct = computeStructural(doc);

        List<ScoredLabel> scored = new ArrayList<>();
        for (PreparedLabel label : prepared) {
            double score = 0;
            int distinct = 0;

            for (Phrase phrase : label.phrases()) {
                double best = 0;
                for (String zone : new String[] {"title", "first", "any"}) {
                    String hay =
                            zone.equals("title")
                                    ? titleNorm
                                    : zone.equals("first") ? firstNorm : anyNorm;
                    int count = countOccurrences(hay, phrase.text());
                    if (count == 0) continue;
                    double zf =
                            phrase.where().equals("any") || phrase.where().equals(zone) ? 1 : 0.75;
                    best = Math.max(best, phrase.weight() * ZONE_MULT.get(zone) * zf * damp(count));
                }
                if (best > 0) {
                    score += best;
                    distinct++;
                }
            }

            for (Rx rx : label.regexes()) {
                double best = 0;
                for (String zone : new String[] {"title", "first", "any"}) {
                    String hay =
                            zone.equals("title")
                                    ? titleRaw
                                    : zone.equals("first") ? firstRaw : anyRaw;
                    int count = countRegex(rx.re(), hay);
                    if (count == 0) continue;
                    double zf = rx.where().equals("any") || rx.where().equals(zone) ? 1 : 0.75;
                    best = Math.max(best, rx.weight() * ZONE_MULT.get(zone) * zf * damp(count));
                }
                if (best > 0) {
                    score += best;
                    distinct++;
                }
            }

            for (FileRx fn : label.filenames()) {
                if (countRegex(fn.re(), fileNameLower) > 0) {
                    score += fn.weight();
                    distinct++;
                }
            }

            for (MetaRx md : label.metadata()) {
                String value =
                        md.field().equals("any") ? metaAll : meta.getOrDefault(md.field(), "");
                if (countRegex(md.re(), value) > 0) {
                    score += md.weight();
                    distinct++;
                }
            }

            for (Structural st : label.structural()) {
                double value = struct.getOrDefault(st.signal(), 0.0);
                if (value > 0) score += st.weight() * value;
            }

            for (Negative neg : label.negatives()) {
                int count =
                        neg.text() != null
                                ? countOccurrences(anyNorm, neg.text())
                                : countRegex(neg.re(), anyRaw);
                if (count > 0) score -= neg.weight() * damp(Math.min(count, 3));
            }

            if (score > 0) {
                score *= pagePriorMultiplier(label.id(), doc.pageCount());
                scored.add(new ScoredLabel(label, score, distinct));
            }
        }

        scored.sort(Comparator.comparingDouble((ScoredLabel s) -> s.score).reversed());

        ScoredLabel top = scored.isEmpty() ? null : scored.get(0);
        double s1 = top != null ? top.score : 0;
        double s2 = scored.size() > 1 ? scored.get(1).score : 0;
        double margin = s1 - s2;

        String confidence = "none";
        if (top != null && s1 >= FLOOR) {
            if (s1 >= HIGH_SCORE
                    && margin >= HIGH_MARGIN
                    && top.distinct >= HIGH_SIGNALS
                    && s2 <= s1 * 0.65) {
                confidence = "high";
            } else if (s1 >= MED_SCORE && margin >= MED_MARGIN) {
                confidence = "medium";
            } else {
                confidence = "low";
            }
        }

        int roundedScore = (int) Math.round(s1);
        if (top == null || confidence.equals("none")) {
            return new HeuristicResult(List.of(), "none", roundedScore, en.isEnglish());
        }
        // Internal-only winner (book, menu...): suppress output rather than mislabel.
        if (!top.label.emit()) {
            return new HeuristicResult(List.of(), confidence, roundedScore, en.isEnglish());
        }

        List<String> labels = new ArrayList<>();
        labels.add(top.label.id());
        for (int i = 1; i < scored.size() && labels.size() < 5; i++) {
            ScoredLabel s = scored.get(i);
            if (labels.size() - 1 >= SEC_MAX) break;
            if (s.label.emit()
                    && s.score >= SEC_FLOOR
                    && s.score >= s1 * SEC_FRAC
                    && s.distinct >= SEC_SIGNALS) {
                labels.add(s.label.id());
            }
        }
        return new HeuristicResult(labels, confidence, roundedScore, en.isEnglish());
    }

    private static final class ScoredLabel {
        final PreparedLabel label;
        final double score;
        final int distinct;

        ScoredLabel(PreparedLabel label, double score, int distinct) {
            this.label = label;
            this.score = score;
            this.distinct = distinct;
        }
    }

    // -----------------------------------------------------------------------
    // English detection
    // -----------------------------------------------------------------------

    record EnglishResult(boolean isEnglish, boolean lowText) {}

    static EnglishResult detectEnglish(String text) {
        String raw = nz(text);
        int letters = countAll(LETTERS, raw);
        if (letters < 25) return new EnglishResult(false, true);

        for (Pattern re : SCRIPT_RANGES) {
            int hits = countAll(re, raw);
            if ((double) hits / letters > 0.25) return new EnglishResult(false, false);
        }

        double latinRatio = (double) countAll(LATIN_LETTER, raw) / letters;
        List<String> words = allMatches(WORD, normalize(raw));
        int totalWords = Math.max(words.size(), 1);
        int enHits = 0;
        for (String w : words) if (STOPWORDS.contains(w)) enHits++;
        double stopRatio = (double) enHits / totalWords;

        double bestScore = 0, bestRatio = 0;
        int bestDistinct = 0, bestDia = 0;
        for (LatinProfile profile : LATIN_PROFILES) {
            int hits = 0;
            Set<String> distinct = new HashSet<>();
            for (String w : words) {
                if (profile.words().contains(w)) {
                    hits++;
                    distinct.add(w);
                }
            }
            int diaCount = profile.dia() == null ? 0 : countAll(profile.dia(), raw);
            double ratio = (double) hits / totalWords;
            double score = ratio + Math.min((double) diaCount / totalWords, 0.15) * 6;
            if (score > bestScore) {
                bestScore = score;
                bestRatio = ratio;
                bestDistinct = distinct.size();
                bestDia = diaCount;
            }
        }

        boolean lowText = totalWords < 30;
        boolean nonEnglish =
                latinRatio >= 0.7
                        && totalWords >= 12
                        && (bestDistinct >= 3 || bestDia >= 6)
                        && (bestDia >= 3 || bestRatio >= 0.1)
                        && bestScore > stopRatio * 1.2
                        && (stopRatio < 0.04 || bestRatio > stopRatio * 1.5);
        if (nonEnglish) return new EnglishResult(false, lowText);

        double bar = lowText ? 0.03 : 0.045;
        return new EnglishResult(latinRatio >= 0.75 && stopRatio >= bar, lowText);
    }

    // -----------------------------------------------------------------------
    // Structural signals
    // -----------------------------------------------------------------------

    private static Map<String, Double> computeStructural(HeuristicDoc doc) {
        String all = nz(doc.allZone());
        List<String> lines = new ArrayList<>();
        for (String l : all.split("\n", -1)) {
            String t = l.trim();
            if (!t.isEmpty()) lines.add(t);
        }
        List<String> tokens = new ArrayList<>();
        for (String t : WHITESPACE.split(all)) {
            if (!t.isEmpty()) tokens.add(t);
        }
        int totalTokens = Math.max(tokens.size(), 1);

        int currency = countAll(CURRENCY, all);
        int numericTokens = 0;
        for (String t : tokens) {
            if (NUMERIC_TOKEN.matcher(t).matches() && DIGIT.matcher(t).find()) numericTokens++;
        }
        int formLines = 0;
        for (String l : lines) {
            if (FORM_LABEL.matcher(l).find()
                    || UNDERSCORE4.matcher(l).find()
                    || CHECKBOX.matcher(l).find()) formLines++;
        }
        int dotLeaders = 0;
        for (String l : lines) if (DOT_LEADER.matcher(l).find()) dotLeaders++;
        int bullets = 0;
        for (String l : lines) if (BULLET.matcher(l).find()) bullets++;
        int urls = countAll(URL, all);
        String tail = all.length() > 2500 ? all.substring(all.length() - 2500) : all;
        String last4000 = all.length() > 4000 ? all.substring(all.length() - 4000) : all;

        Map<String, Double> s = new HashMap<>();
        s.put("currency_heavy", currency >= 8 ? 1.0 : Math.min(currency / 8.0, 1.0));
        s.put("number_table", (double) numericTokens / totalTokens >= 0.22 ? 1.0 : 0.0);
        s.put("form_like", formLines >= 6 ? 1.0 : formLines >= 3 ? 0.5 : 0.0);
        s.put("toc", (TOC.matcher(all).find() || dotLeaders >= 5) ? 1.0 : 0.0);
        s.put(
                "signature_block",
                (SIG1.matcher(tail).find() || SIG2.matcher(tail).find()) ? 1.0 : 0.0);
        s.put(
                "references_section",
                (REF1.matcher(last4000).find() && REF2.matcher(last4000).find()) ? 1.0 : 0.0);
        s.put("short_doc", doc.pageCount() > 0 && doc.pageCount() <= 2 ? 1.0 : 0.0);
        s.put("long_doc", doc.pageCount() >= 40 ? 1.0 : 0.0);
        s.put("bullet_heavy", bullets >= 12 ? 1.0 : bullets >= 6 ? 0.5 : 0.0);
        s.put(
                "email_headers",
                (EMAIL_FROM.matcher(all).find() && EMAIL_SUBJ.matcher(all).find()) ? 1.0 : 0.0);
        s.put("url_heavy", urls >= 6 ? 1.0 : 0.0);
        s.put("address_block", countAll(ADDRESS, all) >= 2 ? 1.0 : 0.0);
        return s;
    }

    private double pagePriorMultiplier(String labelId, int pageCount) {
        Prior prior = priors.get(labelId);
        if (prior == null || pageCount < 1) return 1;
        if (prior.max() != null && pageCount > prior.max()) {
            return Math.max(0.3, (double) prior.max() / pageCount);
        }
        if (pageCount < prior.min()) return Math.max(0.3, (double) pageCount / prior.min());
        return 1;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String normalize(String text) {
        return WHITESPACE.matcher(nz(text).toLowerCase(Locale.ROOT)).replaceAll(" ");
    }

    private static double damp(int count) {
        if (count <= 0) return 0;
        return 1 + 0.35 * (Math.log(Math.min(count, 12)) / Math.log(2));
    }

    private static int countOccurrences(String haystack, String needle) {
        if (needle == null || needle.isEmpty()) return 0;
        int count = 0;
        int idx = haystack.indexOf(needle);
        while (idx != -1 && count < 12) {
            count++;
            idx = haystack.indexOf(needle, idx + needle.length());
        }
        return count;
    }

    private static int countRegex(Pattern re, String text) {
        if (re == null || text == null || text.isEmpty()) return 0;
        Matcher m = re.matcher(text);
        int count = 0;
        while (count < 12 && m.find()) count++;
        return count;
    }

    private static int countAll(Pattern re, String text) {
        if (text == null || text.isEmpty()) return 0;
        Matcher m = re.matcher(text);
        int count = 0;
        while (m.find()) count++;
        return count;
    }

    private static List<String> allMatches(Pattern re, String text) {
        List<String> out = new ArrayList<>();
        if (text == null || text.isEmpty()) return out;
        Matcher m = re.matcher(text);
        while (m.find()) out.add(m.group());
        return out;
    }
}
