fn main() {
    #[cfg(target_os = "macos")]
    {
        // Without these, Cargo can keep a stale picker.o across SHA-1 → SHA-256 source edits.
        println!("cargo:rerun-if-changed=native/picker.m");
        println!("cargo:rerun-if-changed=native/picker.h");

        cc::Build::new()
            .file("native/picker.m")
            .flag("-fobjc-arc")
            .compile("macos_keychain_picker");
        println!("cargo:rustc-link-lib=framework=Security");
        println!("cargo:rustc-link-lib=framework=SecurityInterface");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
}
