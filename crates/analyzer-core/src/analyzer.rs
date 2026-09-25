use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use ignore::{DirEntry, WalkBuilder};

use crate::{
    error::AnalysisError,
    model::{AnalysisReport, AnalysisSummary, FileAnalysis},
    oxc_facts::analyze_script,
    prisma::analyze_prisma,
    relations::build_contracts,
};

#[derive(Debug, Clone, Copy)]
pub struct AnalysisLimits {
    pub max_files: usize,
    pub max_file_bytes: u64,
}

impl Default for AnalysisLimits {
    fn default() -> Self {
        Self {
            max_files: 20_000,
            max_file_bytes: 2 * 1024 * 1024,
        }
    }
}

pub fn analyze_project(root: &Path) -> Result<AnalysisReport, AnalysisError> {
    analyze_project_with_limits(root, AnalysisLimits::default())
}

pub fn analyze_project_with_limits(
    root: &Path,
    limits: AnalysisLimits,
) -> Result<AnalysisReport, AnalysisError> {
    validate_project_root(root)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|source| AnalysisError::Canonicalize {
            path: root.to_path_buf(),
            source,
        })?;

    let candidate_paths = discover_source_files(&canonical_root, limits.max_files)?;
    let mut files = Vec::with_capacity(candidate_paths.len());

    for path in candidate_paths {
        let metadata = std::fs::metadata(&path).map_err(|source| AnalysisError::ReadFile {
            path: path.clone(),
            source,
        })?;
        if metadata.len() > limits.max_file_bytes {
            continue;
        }

        let source_text =
            std::fs::read_to_string(&path).map_err(|source| AnalysisError::ReadFile {
                path: path.clone(),
                source,
            })?;
        let relative_path = normalized_relative_path(&canonical_root, &path);
        let content_hash = blake3::hash(source_text.as_bytes()).to_hex().to_string();

        let file = if is_prisma_schema(&path) {
            analyze_prisma(&relative_path, &source_text, content_hash)
        } else {
            analyze_script(&path, &relative_path, &source_text, content_hash)
        };
        files.push(file);
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));
    let summary = summarize(&files);
    let contracts = build_contracts(&files);

    Ok(AnalysisReport {
        root: canonical_root.to_string_lossy().into_owned(),
        analyzed_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        summary,
        files,
        contracts,
    })
}

fn validate_project_root(root: &Path) -> Result<(), AnalysisError> {
    if !root.exists() {
        return Err(AnalysisError::ProjectNotFound(root.to_path_buf()));
    }
    if !root.is_dir() {
        return Err(AnalysisError::ProjectNotDirectory(root.to_path_buf()));
    }
    Ok(())
}

fn discover_source_files(root: &Path, max_files: usize) -> Result<Vec<PathBuf>, AnalysisError> {
    let mut paths = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .git_ignore(true)
        .git_exclude(true)
        .ignore(true)
        .filter_entry(is_allowed_entry)
        .build();

    for entry in walker.flatten() {
        let path = entry.path();
        if path.is_file() && is_supported_source(path) {
            paths.push(path.to_path_buf());
            if paths.len() > max_files {
                return Err(AnalysisError::TooManyFiles(max_files));
            }
        }
    }

    Ok(paths)
}

fn is_allowed_entry(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy();
    !matches!(
        name.as_ref(),
        "node_modules" | "target" | "dist" | "build" | ".next" | ".git"
    )
}

fn is_supported_source(path: &Path) -> bool {
    if is_prisma_schema(path) {
        return true;
    }

    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("js" | "jsx" | "mjs" | "cjs" | "ts" | "tsx" | "mts" | "cts")
    )
}

fn is_prisma_schema(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()) == Some("schema.prisma")
}

fn normalized_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn summarize(files: &[FileAnalysis]) -> AnalysisSummary {
    let mut summary = AnalysisSummary {
        total_files: files.len(),
        ..AnalysisSummary::default()
    };

    for file in files {
        summary.total_bytes += file.byte_length;
        summary.imports += file.metrics.imports;
        summary.functions += file.metrics.functions;
        summary.classes += file.metrics.classes;
        summary.calls += file.metrics.calls;
        summary.routes += file.metrics.routes;
        summary.prisma_models += file.metrics.prisma_models;
        summary.prisma_enums += file.metrics.prisma_enums;
        summary.diagnostics += file.diagnostics.len();

        if file.diagnostics.is_empty() {
            summary.parsed_files += 1;
        } else {
            summary.failed_files += 1;
        }
    }

    summary
}
