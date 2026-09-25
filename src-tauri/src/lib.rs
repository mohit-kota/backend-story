mod commands;
mod error;
mod ollama;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::analyze_project,
            commands::get_ollama_status,
            commands::interpret_prisma_with_ollama
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Backend Story");
}
