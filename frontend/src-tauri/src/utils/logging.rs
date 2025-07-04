use std::sync::Mutex;
use std::collections::VecDeque;

// Store backend logs globally
static BACKEND_LOGS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

// Helper function to add log entry
pub fn add_log(message: String) {
    
    let mut logs = BACKEND_LOGS.lock().unwrap();
    logs.push_back(format!("{}: {}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(), message));
    // Keep only last 100 log entries
    if logs.len() > 100 {
        logs.pop_front();
    }
    
    // Remove trailing newline if present
    let clean_message = message.trim_end_matches('\n').to_string();
    println!("{}", clean_message); // Also print to console
}