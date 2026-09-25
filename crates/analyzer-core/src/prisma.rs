use crate::model::{FileAnalysis, FileMetrics, SourceSpan, SymbolFact, SymbolKind};

pub(crate) fn analyze_prisma(
    relative_path: &str,
    source_text: &str,
    content_hash: String,
) -> FileAnalysis {
    let mut symbols = Vec::new();
    let mut byte_offset = 0_u32;

    for (line_index, line) in source_text.lines().enumerate() {
        let trimmed = line.trim_start();

        if let Some((kind, name)) = parse_declaration(trimmed) {
            let indentation = line.len().saturating_sub(trimmed.len()) as u32;
            let start = byte_offset + indentation;
            let end = start + trimmed.len() as u32;
            let line_number = line_index as u32 + 1;
            let kind_label = match kind {
                SymbolKind::PrismaModel => "model",
                SymbolKind::PrismaEnum => "enum",
                SymbolKind::Function
                | SymbolKind::Class
                | SymbolKind::Method
                | SymbolKind::Schema => "symbol",
            };

            symbols.push(SymbolFact {
                id: format!("symbol:{relative_path}:prisma-{kind_label}:{name}"),
                name: name.to_owned(),
                kind,
                span: SourceSpan {
                    start,
                    end,
                    start_line: Some(line_number),
                    end_line: Some(line_number),
                },
            });
        }

        byte_offset += line.len() as u32 + 1;
    }

    let prisma_models = symbols
        .iter()
        .filter(|symbol| matches!(symbol.kind, SymbolKind::PrismaModel))
        .count();
    let prisma_enums = symbols
        .iter()
        .filter(|symbol| matches!(symbol.kind, SymbolKind::PrismaEnum))
        .count();

    FileAnalysis {
        id: format!("file:{relative_path}"),
        path: relative_path.to_owned(),
        language: "Prisma Schema".to_owned(),
        content_hash,
        byte_length: source_text.len() as u64,
        imports: Vec::new(),
        symbols,
        calls: Vec::new(),
        routes: Vec::new(),
        diagnostics: Vec::new(),
        metrics: FileMetrics {
            prisma_models,
            prisma_enums,
            ..FileMetrics::default()
        },
    }
}

fn parse_declaration(line: &str) -> Option<(SymbolKind, &str)> {
    let (kind, remaining) = if let Some(remaining) = line.strip_prefix("model ") {
        (SymbolKind::PrismaModel, remaining)
    } else if let Some(remaining) = line.strip_prefix("enum ") {
        (SymbolKind::PrismaEnum, remaining)
    } else {
        return None;
    };

    let name = remaining
        .split(|character: char| character.is_whitespace() || character == '{')
        .next()
        .unwrap_or_default();

    (!name.is_empty()).then_some((kind, name))
}

#[cfg(test)]
mod tests {
    use super::parse_declaration;
    use crate::model::SymbolKind;

    #[test]
    fn parses_model_and_enum_declarations() {
        let model = parse_declaration("model User {");
        let enumeration = parse_declaration("enum Status {");

        assert!(matches!(model, Some((SymbolKind::PrismaModel, "User"))));
        assert!(matches!(
            enumeration,
            Some((SymbolKind::PrismaEnum, "Status"))
        ));
    }
}
