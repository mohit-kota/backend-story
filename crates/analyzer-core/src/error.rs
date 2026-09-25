use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AnalysisError {
    #[error("project path does not exist: {0}")]
    ProjectNotFound(PathBuf),
    #[error("project path is not a directory: {0}")]
    ProjectNotDirectory(PathBuf),
    #[error("failed to canonicalize {path}: {source}")]
    Canonicalize {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to read {path}: {source}")]
    ReadFile {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("project contains more than the configured limit of {0} source files")]
    TooManyFiles(usize),
}
