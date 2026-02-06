use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    SaaS,
    SelfHosted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionState {
    pub mode: ConnectionMode,
    pub server_config: Option<ServerConfig>,
    pub lock_connection_mode: bool,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            mode: ConnectionMode::SaaS,
            server_config: None,
            lock_connection_mode: false,
        }
    }
}

pub struct AppConnectionState(pub Mutex<ConnectionState>);

impl Default for AppConnectionState {
    fn default() -> Self {
        Self(Mutex::new(ConnectionState::default()))
    }
}
