use std::path::PathBuf;

use analyzer_core::{AnalysisReport, OllamaStatus};

use crate::{error::CommandError, ollama};

#[tauri::command]
pub(crate) async fn analyze_project(root: String) -> Result<AnalysisReport, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        analyzer_core::analyze_project(&PathBuf::from(root)).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError::internal(format!("analysis task failed: {error}")))?
}

#[tauri::command]
pub(crate) async fn get_ollama_status() -> Result<OllamaStatus, CommandError> {
    tauri::async_runtime::spawn_blocking(ollama::get_status)
        .await
        .map_err(|error| CommandError::internal(format!("Ollama check failed: {error}")))
}

#[tauri::command]
pub(crate) async fn interpret_prisma_with_ollama(
    model: String,
    prisma_model: String,
    operation: String,
    prisma_expression: String,
    deterministic_sql: Option<String>,
) -> Result<ollama::AiSqlInterpretation, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        ollama::interpret_sql(
            &model,
            &prisma_model,
            &operation,
            &prisma_expression,
            deterministic_sql.as_deref(),
        )
    })
    .await
    .map_err(|error| CommandError::internal(format!("Ollama interpretation failed: {error}")))?
}
