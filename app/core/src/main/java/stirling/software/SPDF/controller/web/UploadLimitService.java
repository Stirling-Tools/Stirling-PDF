package stirling.software.SPDF.controller.web;

import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Service
@Slf4j
public class UploadLimitService {

    @Autowired private ApplicationProperties applicationProperties;

    public long getUploadLimit() {
        String raw =
                applicationProperties.getSystem().getFileUploadLimit() != null
                        ? applicationProperties.getSystem().getFileUploadLimit()
                        : "";
        if (raw == null || raw.isEmpty()) {
            return 0L;
        }
        String s = raw.trim();
        // Normalize case for unit parsing
        String upper = s.toUpperCase(Locale.ROOT);
        // Expect strictly: 0-999 followed by KB/MB/GB
        // Find last two chars as unit if length >= 3
        if (upper.length() < 3) return 0L;
        String unit = upper.substring(upper.length() - 2);
        if (!unit.equals("KB") && !unit.equals("MB") && !unit.equals("GB")) {
            return 0L;
        }
        String numPart = upper.substring(0, upper.length() - 2);
        // Disallow signs, decimals, spaces; only 1-3 digits (allow 0)
        if (numPart.length() > 3) {
            return 0L;
        }
        for (int i = 0; i < numPart.length(); i++) {
            char c = numPart.charAt(i);
            if (c < '0' || c > '9') return 0L;
        }
        long value;
        try {
            value = Long.parseLong(numPart);
        } catch (NumberFormatException e) {
            return 0L;
        }
        return switch (unit) {
            case "KB" -> value * 1024L;
            case "MB" -> value * 1024L * 1024L;
            case "GB" -> value * 1024L * 1024L * 1024L;
            default -> 0L;
        };
    }

    // TODO: why do this server side not client?
    public String getReadableUploadLimit() {
        return humanReadableByteCount(getUploadLimit());
    }

    private String humanReadableByteCount(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp - 1) + "B";
        return String.format(Locale.ROOT, "%.1f %s", bytes / Math.pow(1024, exp), pre);
    }
}
