package stirling.software.proprietary.integration.purview.protection;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import stirling.software.common.model.ApplicationProperties;

final class FakeMipHelper {

    private FakeMipHelper() {}

    static ApplicationProperties propertiesRunning(Path dir, String script) throws IOException {
        Path helper = dir.resolve("fake-mip");
        Files.writeString(helper, "#!/bin/sh\n" + script, StandardCharsets.UTF_8);
        Files.setPosixFilePermissions(helper, PosixFilePermissions.fromString("rwx------"));
        return propertiesWithHelperAt(helper);
    }

    static ApplicationProperties propertiesWithHelperAt(Path helper) {
        ApplicationProperties properties = new ApplicationProperties();
        properties
                .getPremium()
                .getProFeatures()
                .getMicrosoft()
                .getRightsManagement()
                .setHelperPath(helper.toString());
        return properties;
    }
}
