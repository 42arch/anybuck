use crate::connection::manager::{StorageConnectionState, client_for_connection};
use crate::storage::s3::compatibility::{self, ProbeMode, ProbeReport};
use tauri::State;

#[tauri::command]
pub(crate) async fn run_compatibility_probe(
    connection_id: String,
    mode: ProbeMode,
    state: State<'_, StorageConnectionState>,
) -> Result<ProbeReport, String> {
    let (client, bucket) = client_for_connection(&connection_id, state.inner())?;
    Ok(compatibility::run_probe(client, bucket, connection_id, mode).await)
}
