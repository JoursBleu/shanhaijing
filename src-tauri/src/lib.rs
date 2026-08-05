use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init schema",
            sql: include_str!("../../src/db/migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "mcp servers",
            sql: include_str!("../../src/db/migrations/0002_mcp.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "knowledge base / rag",
            sql: include_str!("../../src/db/migrations/0003_kb.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "embedding config + memory vectors",
            sql: include_str!("../../src/db/migrations/0004_embedding.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "per-agent tool/mcp/knowledge config",
            sql: include_str!("../../src/db/migrations/0005_assistant.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "knowledge base retrieval config",
            sql: include_str!("../../src/db/migrations/0006_rag.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "structured tool messages",
            sql: include_str!("../../src/db/migrations/0007_tool_messages.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "focus on single-agent tooling",
            sql: include_str!("../../src/db/migrations/0008_agent_focus.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:shanhaijing.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
