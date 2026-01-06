package stirling.software.SPDF.util;

import java.io.File;
import java.io.IOException;
import java.security.Provider;
import java.security.Security;

import org.apache.commons.io.FileUtils;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.util.ExceptionUtils;

public final class Pkcs11ProviderLoader {

    private Pkcs11ProviderLoader() {}

    public static Provider loadProvider(MultipartFile configFile) throws IOException {
        Provider baseProvider = Security.getProvider("SunPKCS11");
        if (baseProvider == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument",
                    "Invalid argument: {0}",
                    "SunPKCS11 provider is not available in this JVM");
        }

        File tempFile = File.createTempFile("spdf-pkcs11", ".cfg");
        tempFile.deleteOnExit();
        try {
            FileUtils.copyInputStreamToFile(configFile.getInputStream(), tempFile);
            Provider provider = baseProvider.configure(tempFile.getAbsolutePath());
            Provider existingProvider = Security.getProvider(provider.getName());
            if (existingProvider != null) {
                return existingProvider;
            }
            Security.addProvider(provider);
            return provider;
        } catch (IOException e) {
            if (tempFile.exists()) {
                tempFile.delete();
            }
            throw e;
        }
    }
}
