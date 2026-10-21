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
        .manage(connection::manager::R2ConnectionState::default())
        .setup(|app| {
            let transfers = transfers::manager::TransferManager::load(app.handle())
                .map_err(std::io::Error::other)?;
            app.manage(transfers);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::connections::connect_r2,
            commands::connections::list_saved_r2_connections,
            commands::connections::connect_saved_r2_connection,
            commands::connections::disconnect_r2_connection,
            commands::connections::forget_saved_r2_connection,
            commands::objects::list_r2_objects,
            commands::objects::preview_r2_image,
            commands::objects::preview_r2_text,
            commands::objects::delete_r2_objects,
            commands::objects::create_r2_folder,
            commands::transfers::upload_r2_file,
            commands::transfers::download_r2_objects,
            commands::transfers::list_transfer_tasks,
            commands::transfers::enqueue_r2_uploads,
            commands::transfers::enqueue_r2_object_operation,
            commands::transfers::prepare_r2_download,
            commands::transfers::enqueue_r2_download,
            commands::transfers::cancel_transfer_task,
            commands::transfers::retry_transfer_task,
            commands::transfers::clear_transfer_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
