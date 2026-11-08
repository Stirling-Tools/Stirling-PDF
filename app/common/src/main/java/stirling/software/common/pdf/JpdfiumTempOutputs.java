package stirling.software.common.pdf;

import stirling.software.jpdfium.model.StorageOptions;

/**
 * JPDFium options for files the app streams back or reads and then deletes. They skip the fsync a
 * durable publish does, since nothing needs them to survive a crash.
 */
public final class JpdfiumTempOutputs {

    public static final StorageOptions STORAGE = StorageOptions.builder().durable(false).build();

    private JpdfiumTempOutputs() {}
}
