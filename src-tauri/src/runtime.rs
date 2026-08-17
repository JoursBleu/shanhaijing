use crate::runtime_rpc::{request_shutdown, stop_child, RuntimeRpc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const BRIDGE_PROTOCOL_VERSION: u32 = 1;

pub struct RuntimeManager {
    inner: Mutex<RuntimeState>,
}

struct RuntimeState {
    child: Option<Child>,
    rpc: Option<RuntimeRpc>,
    started_at_ms: Option<u128>,
    last_error: Option<String>,
    server_version: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    status: &'static str,
    protocol_version: u32,
    pid: Option<u32>,
    started_at_ms: Option<u128>,
    message: Option<String>,
    server_version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInitializeInput {
    cwd: String,
    provider: String,
    model: String,
    max_tokens: Option<u64>,
    base_url: Option<String>,
    api_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePromptInput {
    session_id: String,
    content_blocks: Vec<Value>,
}

impl RuntimeManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(RuntimeState {
                child: None,
                rpc: None,
                started_at_ms: None,
                last_error: None,
                server_version: None,
            }),
        }
    }

    fn status(&self) -> Result<RuntimeStatus, String> {
        let mut state = self.inner.lock().map_err(|_| "runtime lock poisoned")?;
        refresh_child(&mut state);
        Ok(status_from(&state))
    }

    fn start(
        &self,
        app: &AppHandle,
        credentials: Option<(&str, &str)>,
    ) -> Result<RuntimeStatus, String> {
        let mut state = self.inner.lock().map_err(|_| "runtime lock poisoned")?;
        refresh_child(&mut state);
        if state.child.is_some() {
            return Ok(status_from(&state));
        }

        let launch = runtime_launch(app)?;
        let app_data = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("cannot resolve app data directory: {error}"))?;
        let dsh_home = app_data.join("dsh");
        let session_root = dsh_home.join("sessions");
        std::fs::create_dir_all(&session_root)
            .map_err(|error| format!("cannot create DSH data directories: {error}"))?;

        let mut command = Command::new(&launch.executable);
        command
            .args(&launch.args)
            .env("DSH_HOME", &dsh_home)
            .env("DSH_SESSION_ROOT", &session_root)
            .current_dir(&app_data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        command.env("DSH_CORDIS_CONFIG", &launch.config);
        if let Some((base_url, api_key)) = credentials {
            command
                .env("DEEPSEEK_BASE_URL", base_url)
                .env("DEEPSEEK_API_KEY", api_key);
        }
        let mut child = command.spawn().map_err(|error| {
            let message = format!(
                "cannot start DeepSeek Harness runtime at {}: {error}",
                    launch.executable.display()
            );
            state.last_error = Some(message.clone());
            message
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "DeepSeek Harness runtime has no stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "DeepSeek Harness runtime has no stdout".to_string())?;
        state.rpc = Some(RuntimeRpc::new(stdin, stdout, app.clone()));
        state.started_at_ms = Some(now_ms());
        state.last_error = None;
        state.server_version = None;
        state.child = Some(child);
        Ok(status_from(&state))
    }

    fn initialize(
        &self,
        app: &AppHandle,
        input: RuntimeInitializeInput,
    ) -> Result<RuntimeStatus, String> {
        let credentials = input.base_url.as_deref().zip(input.api_key.as_deref());
        self.start(app, credentials)?;
        let mut state = self.inner.lock().map_err(|_| "runtime lock poisoned")?;
        refresh_child(&mut state);
        let rpc = state
            .rpc
            .as_ref()
            .ok_or_else(|| "DeepSeek Harness transport is unavailable".to_string())?;
        let mut params = json!({
            "cwd": input.cwd,
            "provider": input.provider,
            "model": input.model,
        });
        if let Some(max_tokens) = input.max_tokens {
            params["maxTokens"] = json!(max_tokens);
        }
        let result = rpc.request("initialize", params, Duration::from_secs(30))?;
        let server_info = result
            .get("serverInfo")
            .ok_or_else(|| "initialize returned no serverInfo".to_string())?;
        let name = server_info
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| "initialize returned no server name".to_string())?;
        if name != "deepseek-harness-sdk-runtime" {
            return Err(format!("unexpected DeepSeek Harness runtime: {name}"));
        }
        state.server_version = Some(
            server_info
                .get("version")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
        );
        Ok(status_from(&state))
    }

    fn prompt(&self, input: RuntimePromptInput) -> Result<Value, String> {
        let mut state = self.inner.lock().map_err(|_| "runtime lock poisoned")?;
        refresh_child(&mut state);
        if state.server_version.is_none() {
            return Err("DeepSeek Harness runtime is not initialized".to_string());
        }
        state
            .rpc
            .as_ref()
            .ok_or_else(|| "DeepSeek Harness transport is unavailable".to_string())?
            .request(
                "session/prompt",
                json!({
                    "sessionId": input.session_id,
                    "contentBlocks": input.content_blocks,
                }),
                Duration::from_secs(30),
            )
    }

    fn stop(&self) -> Result<RuntimeStatus, String> {
        let mut state = self.inner.lock().map_err(|_| "runtime lock poisoned")?;
        if let Some(rpc) = state.rpc.as_ref() {
            request_shutdown(rpc);
        }
        state.rpc = None;
        if let Some(mut child) = state.child.take() {
            stop_child(&mut child)?;
        }
        state.started_at_ms = None;
        state.last_error = None;
        state.server_version = None;
        Ok(status_from(&state))
    }
}

impl Drop for RuntimeManager {
    fn drop(&mut self) {
        if let Ok(state) = self.inner.get_mut() {
            state.rpc = None;
            if let Some(child) = state.child.as_mut() {
                let _ = stop_child(child);
            }
        }
    }
}

fn refresh_child(state: &mut RuntimeState) {
    let Some(child) = state.child.as_mut() else {
        return;
    };
    match child.try_wait() {
        Ok(Some(exit)) => {
            state.child = None;
            state.rpc = None;
            state.started_at_ms = None;
            state.server_version = None;
            state.last_error = Some(format!("DeepSeek Harness runtime exited: {exit}"));
        }
        Ok(None) => {}
        Err(error) => {
            state.child = None;
            state.rpc = None;
            state.started_at_ms = None;
            state.server_version = None;
            state.last_error = Some(format!("cannot inspect runtime process: {error}"));
        }
    }
}

fn status_from(state: &RuntimeState) -> RuntimeStatus {
    RuntimeStatus {
        status: runtime_status_name(
            state.child.is_some(),
            state.server_version.is_some(),
            state.last_error.is_some(),
        ),
        protocol_version: BRIDGE_PROTOCOL_VERSION,
        pid: state.child.as_ref().map(Child::id),
        started_at_ms: state.started_at_ms,
        message: state.last_error.clone(),
        server_version: state.server_version.clone(),
    }
}

fn runtime_status_name(has_child: bool, initialized: bool, has_error: bool) -> &'static str {
    if has_child && initialized {
        "ready"
    } else if has_child {
        "starting"
    } else if has_error {
        "crashed"
    } else {
        "stopped"
    }
}

struct RuntimeLaunch {
    executable: PathBuf,
    args: Vec<String>,
    config: PathBuf,
}

fn runtime_launch(app: &AppHandle) -> Result<RuntimeLaunch, String> {
    let configured = std::env::var_os("SHANHAIJING_DSH_CORDIS_CONFIG")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let resource_root = app.path().resource_dir().ok();
    let packaged_config = resource_root
        .as_ref()
        .map(|root| root.join("dsh").join("cordis.yml"))
        .filter(|path| path.is_file());
    let config = configured.or(packaged_config).unwrap_or_else(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dsh/cordis.yml")
    });
    if !config.is_file() {
        return Err(format!("DeepSeek Harness config not found: {}", config.display()));
    }

    if let Some(executable) = std::env::var_os("SHANHAIJING_DSH_RUNTIME_BIN")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    {
        let args = std::env::var("SHANHAIJING_DSH_RUNTIME_ARGS")
            .ok()
            .map(|value| value.split_whitespace().map(str::to_owned).collect())
            .unwrap_or_default();
        return Ok(RuntimeLaunch {
            executable,
            args,
            config,
        });
    }

    let packaged_root = resource_root
        .map(|root| root.join("dsh-runtime"))
        .filter(|root| root.join(runtime_binary_name()).is_file());
    if let Some(root) = packaged_root {
        let executable = root.join(runtime_binary_name());
        let script = root
            .join("app")
            .join("node_modules")
            .join("@deepseek-ai")
            .join("dsh-sdk-jsonrpc-demo")
            .join("lib")
            .join("bin.js");
        if !script.is_file() {
            return Err(format!(
                "packaged DeepSeek Harness entry not found: {}",
                script.display()
            ));
        }
        return Ok(RuntimeLaunch {
            executable,
            args: vec![
                script.to_string_lossy().into_owned(),
                config.to_string_lossy().into_owned(),
            ],
            config,
        });
    }

    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let script = project_root
        .join("node_modules")
        .join("@deepseek-ai")
        .join("dsh-sdk-jsonrpc-demo")
        .join("lib")
        .join("bin.js");
    if script.is_file() {
        return Ok(RuntimeLaunch {
            executable: PathBuf::from(if cfg!(windows) { "node.exe" } else { "node" }),
            args: vec![script.to_string_lossy().into_owned(), config.to_string_lossy().into_owned()],
            config,
        });
    }

    Err("DeepSeek Harness runtime not found; install dependencies or set SHANHAIJING_DSH_RUNTIME_BIN".to_string())
}

fn runtime_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "dsh-jsonrpc-agent.exe"
    } else {
        "dsh-jsonrpc-agent"
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[tauri::command]
pub fn runtime_status(manager: State<'_, RuntimeManager>) -> Result<RuntimeStatus, String> {
    manager.status()
}

#[tauri::command]
pub fn runtime_start(
    app: AppHandle,
    manager: State<'_, RuntimeManager>,
) -> Result<RuntimeStatus, String> {
    manager.start(&app, None)
}

#[tauri::command]
pub fn runtime_initialize(
    app: AppHandle,
    manager: State<'_, RuntimeManager>,
    input: RuntimeInitializeInput,
) -> Result<RuntimeStatus, String> {
    manager.initialize(&app, input)
}

#[tauri::command]
pub fn runtime_prompt(
    manager: State<'_, RuntimeManager>,
    input: RuntimePromptInput,
) -> Result<Value, String> {
    manager.prompt(input)
}

#[tauri::command]
pub fn runtime_stop(manager: State<'_, RuntimeManager>) -> Result<RuntimeStatus, String> {
    manager.stop()
}

#[tauri::command]
pub fn runtime_restart(
    app: AppHandle,
    manager: State<'_, RuntimeManager>,
) -> Result<RuntimeStatus, String> {
    manager.stop()?;
    manager.start(&app, None)
}

#[tauri::command]
pub fn runtime_workspace_path(app: AppHandle, conversation_id: String) -> Result<String, String> {
    if conversation_id.is_empty()
        || !conversation_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("invalid conversation id for runtime workspace".to_string());
    }
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("cannot resolve app data directory: {error}"))?
        .join("dsh")
        .join("workspaces")
        .join(conversation_id);
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("cannot create runtime workspace: {error}"))?;
    Ok(root.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::runtime_status_name;

    #[test]
    fn stopped_without_process_or_error() {
        assert_eq!(runtime_status_name(false, false, false), "stopped");
    }

    #[test]
    fn process_takes_precedence_over_stale_error() {
        assert_eq!(runtime_status_name(true, false, true), "starting");
    }

    #[test]
    fn error_without_process_is_crashed() {
        assert_eq!(runtime_status_name(false, false, true), "crashed");
    }

    #[test]
    fn initialized_process_is_ready() {
        assert_eq!(runtime_status_name(true, true, false), "ready");
    }
}
