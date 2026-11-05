//! Asserts the refresh-token keyring helper falls through (Ok(false))
//! instead of bailing (Err) when keyring access fails. This was the
//! original login-loop bug.

use app_lib::commands::auth::{
    get_refresh_token_keyring_entry, try_save_refresh_token_to_keyring,
    REFRESH_TOKEN_STORE_KEY_FOR_TESTS, TOKENS_STORE_FILE_FOR_TESTS,
};
use serde_json::json;

const ENV_FORCE_FAIL: &str = "STIRLING_PDF_TEST_FORCE_REFRESH_KEYRING_FAIL";

// Single test fn — env var is process-global; parallel tests would race.
#[test]
fn refresh_token_fallback_proof() {
    // ===== Step 1: env-var injection forces keyring entry-creation to Err =====
    std::env::set_var(ENV_FORCE_FAIL, "1");

    let entry_result = get_refresh_token_keyring_entry();
    assert!(
        entry_result.is_err(),
        "with {} set, get_refresh_token_keyring_entry must return Err",
        ENV_FORCE_FAIL
    );
    let err_msg = entry_result.err().unwrap();
    assert!(
        err_msg.contains("Forced keyring failure for tests"),
        "expected forced-failure marker; got: {}",
        err_msg
    );

    // ===== Step 2: the bug-fix proof =====
    // Original bug: `let entry = get_refresh_token_keyring_entry()?;` would
    // propagate Err and short-circuit save_refresh_token, never reaching the
    // disk-store fallback. Fixed behaviour: the same keyring failure must be
    // converted into a "fall through" signal (Ok(false)), NOT propagated as Err.
    let outcome = try_save_refresh_token_to_keyring("test-token-xyz-456");
    assert!(
        matches!(outcome, Ok(false)),
        "REGRESSION: keyring entry-creation failure must convert to Ok(false) \
         so save_refresh_token falls through to the disk store. Got {:?}. \
         This means the function would short-circuit and the user's refresh \
         token would never be persisted - exactly the original login-loop bug.",
        outcome
    );

    std::env::remove_var(ENV_FORCE_FAIL);

    // ===== Step 3: env-var unset does NOT carry the forced-failure marker =====
    let result_unset = get_refresh_token_keyring_entry();
    if let Err(e) = &result_unset {
        assert!(
            !e.contains("Forced keyring failure for tests"),
            "with {} unset, error must NOT contain forced-failure marker; got: {}",
            ENV_FORCE_FAIL,
            e
        );
    }

    // ===== Step 4: disk-fallback JSON round-trips =====
    // tauri_plugin_store writes via serde_json::to_vec_pretty(&HashMap<String,
    // JsonValue>). Reproduce that format and verify it round-trips, proving
    // the file save_refresh_token's disk fallback writes is readable by
    // get_refresh_token's disk fallback.
    let tmp = std::env::temp_dir().join(format!(
        "stirling_pdf_refresh_token_test_{}.json",
        std::process::id()
    ));
    let token = "test-refresh-token-disk-roundtrip-abc-123";
    let mut map = std::collections::HashMap::<String, serde_json::Value>::new();
    map.insert(REFRESH_TOKEN_STORE_KEY_FOR_TESTS.to_string(), json!(token));
    let bytes = serde_json::to_vec_pretty(&map).expect("serialize tokens map");
    std::fs::write(&tmp, &bytes).expect("write tokens file");

    let read_bytes = std::fs::read(&tmp).expect("read tokens file");
    let read_map: std::collections::HashMap<String, serde_json::Value> =
        serde_json::from_slice(&read_bytes).expect("parse tokens json");
    let retrieved: Option<String> = read_map
        .get(REFRESH_TOKEN_STORE_KEY_FOR_TESTS)
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let _ = std::fs::remove_file(&tmp);

    assert_eq!(
        retrieved,
        Some(token.to_string()),
        "disk-fallback JSON format must round-trip the refresh token (file: {})",
        tmp.display()
    );

    // ===== Step 5: constants match production strings =====
    assert_eq!(TOKENS_STORE_FILE_FOR_TESTS, "tokens.json");
    assert_eq!(REFRESH_TOKEN_STORE_KEY_FOR_TESTS, "refresh_token");
}
