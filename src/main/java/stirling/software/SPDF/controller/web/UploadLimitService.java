package stirling.software.SPDF.controller.web;

import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

@Service
@Slf4j
public class UploadLimitService {

    @Autowired private ApplicationProperties applicationProperties;

    public long getUploadLimit() {
        String maxUploadSize =
                applicationProperties.getSystem().getFileUploadLimit() != null
                        ? applicationProperties.getSystem().getFileUploadLimit()
                        : "";

        if (maxUploadSize.isEmpty()) {
            return 0;
        } else if (!Pattern.compile("^[1-9][0-9]{0,2}[KMGkmg][Bb]$")
                .matcher(maxUploadSize)
                .matches()) {
            log.error(
                    "Invalid maxUploadSize format. Expected format: [1-9][0-9]{0,2}[KMGkmg][Bb], but got: {}",
                    maxUploadSize);
            return 0;
        } else {
            String unit = maxUploadSize.replaceAll("[1-9][0-9]{0,2}", "").toUpperCase();
            String number = maxUploadSize.replaceAll("[KMGkmg][Bb]", "");
            long size = Long.parseLong(number);
            return switch (unit) {
                case "KB" -> size * 1024;
                case "MB" -> size * 1024 * 1024;
                case "GB" -> size * 1024 * 1024 * 1024;
                default -> 0;
            };
        }
    }

    // TODO: why do this server side not client?
    public String getReadableUploadLimit() {
        return humanReadableByteCount(getUploadLimit());
    }

    private String humanReadableByteCount(long bytes) {
        if (bytes < 1024) return bytes + " B";
        int exp = (int) (Math.log(bytes) / Math.log(1024));
        String pre = "KMGTPE".charAt(exp - 1) + "B";
        return String.format(Locale.US, "%.1f %s", bytes / Math.pow(1024, exp), pre);
    }
}
