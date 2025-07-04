use crate::utils::add_log;

// Command to get opened file path (if app was launched with a file)
#[tauri::command]
pub async fn get_opened_file() -> Result<Option<String>, String> {
    // Get command line arguments
    let args: Vec<String> = std::env::args().collect();
    
    // Look for a PDF file argument (skip the first arg which is the executable)
    for arg in args.iter().skip(1) {
        if arg.ends_with(".pdf") && std::path::Path::new(arg).exists() {
            add_log(format!("📂 PDF file opened: {}", arg));
            return Ok(Some(arg.clone()));
        }
    }
    
    Ok(None)
}

