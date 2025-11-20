use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    Offline,
    Server,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerType {
    SaaS,
    SelfHosted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub url: String,
    pub server_type: ServerType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionState {
    pub mode: ConnectionMode,
    pub server_config: Option<ServerConfig>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            mode: ConnectionMode::Offline,
            server_config: None,
        }
    }
}

pub struct AppConnectionState(pub Mutex<ConnectionState>);

impl Default for AppConnectionState {
    fn default() -> Self {
        Self(Mutex::new(ConnectionState::default()))
    }
}
