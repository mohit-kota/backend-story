use analyzer_core::AnalysisError;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommandError {
    code: String,
    message: String,
}

impl CommandError {
    pub(crate) fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal_error".to_owned(),
            message: message.into(),
        }
    }
}

impl From<AnalysisError> for CommandError {
    fn from(error: AnalysisError) -> Self {
        let code = match &error {
            AnalysisError::ProjectNotFound(_) => "project_not_found",
            AnalysisError::ProjectNotDirectory(_) => "project_not_directory",
            AnalysisError::Canonicalize { .. } => "canonicalize_failed",
            AnalysisError::ReadFile { .. } => "read_failed",
            AnalysisError::TooManyFiles(_) => "too_many_files",
        };

        Self {
            code: code.to_owned(),
            message: error.to_string(),
        }
    }
}
