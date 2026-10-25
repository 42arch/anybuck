use tauri::Manager;

mod commands;
mod connection;
mod persistence;
mod security;
mod storage;
mod transfers;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(connection::manager::StorageConnectionState::default())
        .setup(|app| {
            let transfers = transfers::manager::TransferManager::load(app.handle())
                .map_err(std::io::Error::other)?;
            app.manage(transfers);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::connections::connect_storage,
            commands::connections::list_saved_connections,
            commands::connections::rename_connection,
            commands::connections::connect_saved_connection,
            commands::connections::update_saved_connection,
            commands::connections::disconnect_connection,
            commands::connections::forget_saved_connection,
            commands::compatibility::run_compatibility_probe,
            commands::objects::list_objects,
            commands::objects::count_objects,
            commands::objects::preview_image,
            commands::objects::preview_text,
            commands::objects::delete_objects,
            commands::objects::create_folder,
            commands::public_access::probe_public_object_url,
            commands::transfers::upload_file,
            commands::transfers::download_objects,
            commands::transfers::list_transfer_tasks,
            commands::transfers::enqueue_uploads,
            commands::transfers::enqueue_object_operation,
            commands::transfers::prepare_download,
            commands::transfers::enqueue_download,
            commands::transfers::cancel_transfer_task,
            commands::transfers::retry_transfer_task,
            commands::transfers::clear_transfer_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
