use std::{env, path::Path, process::ExitCode};

fn main() -> ExitCode {
    let Some(root) = env::args().nth(1) else {
        eprintln!("usage: analyzer-cli <backend-directory>");
        return ExitCode::FAILURE;
    };

    match analyzer_core::analyze_project(Path::new(&root)) {
        Ok(report) => match serde_json::to_string_pretty(&report) {
            Ok(json) => {
                println!("{json}");
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("failed to serialize analysis: {error}");
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("analysis failed: {error}");
            ExitCode::FAILURE
        }
    }
}
