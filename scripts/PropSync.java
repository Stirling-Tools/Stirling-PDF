package stirling.software.Stirling.Stats;

import java.nio.file.*;
import java.nio.charset.MalformedInputException;
import java.nio.charset.StandardCharsets;
import java.io.*;
import java.util.*;

public class PropSync {

    public static void main(String[] args) throws IOException {
        File folder = new File("C:\\Users\\systo\\git\\Stirling-PDF\\src\\main\\resources");
        File[] files = folder.listFiles((dir, name) -> name.matches("messages_.*\\.properties"));

        List<String> enLines = Files.readAllLines(Paths.get(folder + "\\messages_en_GB.properties"), StandardCharsets.UTF_8);
        Map<String, String> enProps = linesToProps(enLines);

        for (File file : files) {
            if (!"messages_en_GB.properties".equals(file.getName())) {
                System.out.println("Processing file: " + file.getName());
                List<String> lines;
                try {
                    lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
                } catch (MalformedInputException e) {
                    System.out.println("Skipping due to not UTF8 format for file: " + file.getName());
                    continue;
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }

                Map<String, String> currentProps = linesToProps(lines);
                List<String> newLines = syncPropsWithLines(enProps, currentProps, enLines);

                Files.write(file.toPath(), newLines, StandardCharsets.UTF_8);
                System.out.println("Finished processing file: " + file.getName());
            }
        }
    }

    private static Map<String, String> linesToProps(List<String> lines) {
        Map<String, String> props = new LinkedHashMap<>();
        for (String line : lines) {
            if (!line.trim().isEmpty() && line.contains("=")) {
                String[] parts = line.split("=", 2);
                props.put(parts[0].trim(), parts[1].trim());
            }
        }
        return props;
    }

    private static List<String> syncPropsWithLines(Map<String, String> enProps, Map<String, String> currentProps, List<String> enLines) {
        List<String> newLines = new ArrayList<>();
        boolean needsTranslateComment = false; // flag to check if we need to add "TODO: Translate"

        for (String line : enLines) {
            if (line.contains("=")) {
                String key = line.split("=", 2)[0].trim();

                if (currentProps.containsKey(key)) {
                    newLines.add(key + "=" + currentProps.get(key));
                    needsTranslateComment = false;
                } else {
                    if (!needsTranslateComment) {
                        newLines.add("##########################");
                        newLines.add("###  TODO: Translate   ###");
                        newLines.add("##########################");
                        needsTranslateComment = true;
                    }
                    newLines.add(line);
                }
            } else {
                // handle comments and other non-property lines
                newLines.add(line);
                needsTranslateComment = false;  // reset the flag when we encounter comments or empty lines
            }
        }

        return newLines;
    }
}
