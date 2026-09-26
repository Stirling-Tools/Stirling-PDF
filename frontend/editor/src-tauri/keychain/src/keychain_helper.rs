use std::io::{self, Read, Write};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use stirling_keychain::{choose_signing_identity, get_certificate_chain, sign_message};

fn print_error(message: impl AsRef<str>) -> ! {
    let payload = serde_json::json!({ "error": message.as_ref() });
    println!("{}", payload);
    std::process::exit(1);
}

fn main() {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| print_error("Missing command"));

    match command.as_str() {
        "choose-identity" => match choose_signing_identity() {
            Ok(response) => {
                println!("{}", serde_json::to_string(&response).unwrap_or_default());
            }
            Err(err) => print_error(err.to_string()),
        },
        "get-chain" => {
            let identity = args
                .next()
                .unwrap_or_else(|| print_error("Missing identity hash"));
            match get_certificate_chain(&identity) {
                Ok(chain) => {
                    let encoded: Vec<String> = chain
                        .into_iter()
                        .map(|der| BASE64.encode(der))
                        .collect();
                    println!(
                        "{}",
                        serde_json::json!({ "certificatesDerBase64": encoded })
                    );
                }
                Err(err) => print_error(err.to_string()),
            }
        }
        "sign" => {
            let identity = args
                .next()
                .unwrap_or_else(|| print_error("Missing identity hash"));
            let algorithm = args
                .next()
                .unwrap_or_else(|| print_error("Missing signature algorithm"));
            let mut digest = Vec::new();
            if let Err(err) = io::stdin().read_to_end(&mut digest) {
                print_error(format!("Could not read digest from stdin: {err}"));
            }
            match sign_message(&identity, &algorithm, &digest) {
                Ok(signature) => {
                    let mut stdout = io::stdout();
                    stdout
                        .write_all(&signature)
                        .unwrap_or_else(|err| print_error(format!("Could not write signature: {err}")));
                }
                Err(err) => print_error(err.to_string()),
            }
        }
        other => print_error(format!("Unknown command: {other}")),
    }
}
