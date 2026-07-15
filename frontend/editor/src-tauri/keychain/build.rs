fn main() {
    #[cfg(target_os = "macos")]
    {
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
