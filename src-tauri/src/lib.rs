// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

mod storage;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(storage::r2::R2ConnectionState::default())
        .setup(|app| {
            let transfers = storage::transfers::TransferManager::load(app.handle())
                .map_err(std::io::Error::other)?;
            app.manage(transfers);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            storage::r2::connect_r2,
            storage::r2::list_saved_r2_connections,
            storage::r2::connect_saved_r2_connection,
            storage::r2::disconnect_r2_connection,
            storage::r2::forget_saved_r2_connection,
            storage::r2::list_r2_objects,
            storage::r2::delete_r2_objects,
            storage::object_operations::move_r2_objects,
            storage::object_operations::copy_r2_objects,
            storage::r2::create_r2_folder,
            storage::r2::upload_r2_file,
            storage::r2::download_r2_objects,
            storage::transfers::list_transfer_tasks,
            storage::transfers::enqueue_r2_uploads,
            storage::transfers::prepare_r2_download,
            storage::transfers::enqueue_r2_download,
            storage::transfers::cancel_transfer_task,
            storage::transfers::retry_transfer_task,
            storage::transfers::clear_transfer_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
