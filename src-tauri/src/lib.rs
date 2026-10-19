// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod storage;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(storage::r2::R2ConnectionState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            storage::r2::connect_r2,
            storage::r2::list_saved_r2_connections,
            storage::r2::connect_saved_r2_connection,
            storage::r2::disconnect_r2_connection,
            storage::r2::forget_saved_r2_connection,
            storage::r2::list_r2_objects,
            storage::r2::delete_r2_objects
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
