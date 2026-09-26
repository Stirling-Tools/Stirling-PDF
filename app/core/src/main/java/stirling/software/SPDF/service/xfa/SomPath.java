package stirling.software.SPDF.service.xfa;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A fully qualified AcroForm field name read as the XFA SOM path LiveCycle derived it from. Each
 * container appears as {@code name[index]}, an unnamed one as {@code #class[index]}, and a dot
 * inside a name as {@code \.}. LiveCycle can also split a dotted name across two AcroForm levels
 * ({@code seccion\} then {@code f[0]}); joining the partial names with a dot restores the same
 * escaped form, so both spellings parse to the same tokens.
 */
record SomPath(List<Token> tokens) {

    private static final Pattern INDEXED = Pattern.compile("^(.*)\\[(\\d{1,9})]$");

    /**
     * @param index for a named token, which instance of that name; for a class token, which of the
     *     unnamed containers of that class
     */
    record Token(String name, int index, boolean classToken) {

        @Override
        public String toString() {
            return (classToken ? "#" : "") + name.replace(".", "\\.") + "[" + index + "]";
        }
    }

    static SomPath parse(String fullyQualifiedName) {
        List<Token> tokens = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean escaped = false;
        for (int i = 0; i < fullyQualifiedName.length(); i++) {
            char c = fullyQualifiedName.charAt(i);
            if (escaped) {
                current.append(c);
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '.') {
                addToken(tokens, current);
            } else {
                current.append(c);
            }
        }
        if (escaped) {
            current.append('\\');
        }
        addToken(tokens, current);
        return new SomPath(List.copyOf(tokens));
    }

    private static void addToken(List<Token> tokens, StringBuilder raw) {
        String text = raw.toString();
        raw.setLength(0);
        if (text.isEmpty()) {
            return;
        }
        String name = text;
        int index = 0;
        Matcher matcher = INDEXED.matcher(text);
        if (matcher.matches()) {
            name = matcher.group(1);
            index = Integer.parseInt(matcher.group(2));
        }
        boolean classToken = name.startsWith("#") && name.length() > 1;
        tokens.add(new Token(classToken ? name.substring(1) : name, index, classToken));
    }

    Token leaf() {
        return tokens.getLast();
    }

    @Override
    public String toString() {
        return String.join(".", tokens.stream().map(Token::toString).toList());
    }
}
