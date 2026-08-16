use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, ChildStdout},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

const NOTIFICATION_EVENT: &str = "dsh://notification";

type RpcResult = Result<Value, String>;
type Pending = Arc<Mutex<HashMap<String, mpsc::Sender<RpcResult>>>>;

pub struct RuntimeRpc {
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    serial: AtomicU64,
}

impl RuntimeRpc {
    pub fn new(stdin: ChildStdin, stdout: ChildStdout, app: AppHandle) -> Self {
        let pending = Arc::new(Mutex::new(HashMap::new()));
        spawn_reader(stdout, Arc::clone(&pending), app);
        Self {
            stdin: Arc::new(Mutex::new(stdin)),
            pending,
            serial: AtomicU64::new(1),
        }
    }

    pub fn request(&self, method: &str, params: Value, timeout: Duration) -> RpcResult {
        let id = format!("shj_{}", self.serial.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "runtime pending-request lock poisoned".to_string())?
            .insert(id.clone(), tx);

        let frame = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        if let Err(error) = self.write_frame(&frame) {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(frame["id"].as_str().unwrap_or_default());
            }
            return Err(error);
        }

        match rx.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut pending) = self.pending.lock() {
                    pending.remove(frame["id"].as_str().unwrap_or_default());
                }
                Err(format!("DeepSeek Harness request {method} timed out"))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("DeepSeek Harness JSON-RPC transport closed".to_string())
            }
        }
    }

    fn write_frame(&self, frame: &Value) -> Result<(), String> {
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| "runtime stdin lock poisoned".to_string())?;
        serde_json::to_writer(&mut *stdin, frame)
            .map_err(|error| format!("cannot encode runtime request: {error}"))?;
        stdin
            .write_all(b"\n")
            .and_then(|_| stdin.flush())
            .map_err(|error| format!("cannot write runtime request: {error}"))
    }
}

pub fn request_shutdown(rpc: &RuntimeRpc) {
    let _ = rpc.request("shutdown", json!({}), Duration::from_secs(1));
}

pub fn stop_child(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_none()
    {
        child
            .kill()
            .map_err(|error| format!("cannot stop DeepSeek Harness runtime: {error}"))?;
        child
            .wait()
            .map_err(|error| format!("cannot reap DeepSeek Harness runtime: {error}"))?;
    }
    Ok(())
}

fn spawn_reader(stdout: ChildStdout, pending: Pending, app: AppHandle) {
    thread::Builder::new()
        .name("dsh-jsonrpc-reader".to_string())
        .spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else {
                    break;
                };
                let Ok(frame) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if let Some(id) = frame.get("id").and_then(Value::as_str) {
                    let sender = pending.lock().ok().and_then(|mut map| map.remove(id));
                    if let Some(sender) = sender {
                        let result = match frame.get("error") {
                            Some(error) => Err(format_rpc_error(error)),
                            None => Ok(frame.get("result").cloned().unwrap_or(Value::Null)),
                        };
                        let _ = sender.send(result);
                    }
                    continue;
                }
                if frame.get("method").and_then(Value::as_str).is_some() {
                    let _ = app.emit(NOTIFICATION_EVENT, frame);
                }
            }

            let senders = pending
                .lock()
                .map(|mut map| map.drain().map(|(_, sender)| sender).collect::<Vec<_>>())
                .unwrap_or_default();
            for sender in senders {
                let _ = sender.send(Err(
                    "DeepSeek Harness JSON-RPC stdout closed unexpectedly".to_string()
                ));
            }
            let _ = app.emit(
                NOTIFICATION_EVENT,
                json!({
                    "jsonrpc": "2.0",
                    "method": "runtime.crashed",
                    "params": { "message": "DeepSeek Harness transport closed" }
                }),
            );
        })
        .expect("failed to start DeepSeek Harness JSON-RPC reader");
}

fn format_rpc_error(error: &Value) -> String {
    let code = error.get("code").and_then(Value::as_i64);
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("JSON-RPC error");
    match code {
        Some(code) => format!("DeepSeek Harness JSON-RPC error {code}: {message}"),
        None => format!("DeepSeek Harness JSON-RPC error: {message}"),
    }
}

#[cfg(test)]
mod tests {
    use super::format_rpc_error;
    use serde_json::json;

    #[test]
    fn formats_wire_error() {
        assert_eq!(
            format_rpc_error(&json!({ "code": -32601, "message": "missing" })),
            "DeepSeek Harness JSON-RPC error -32601: missing"
        );
    }
}
