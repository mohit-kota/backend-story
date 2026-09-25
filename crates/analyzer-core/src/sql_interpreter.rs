use crate::model::InterpretedSql;

pub(crate) fn interpret_prisma_call(
    model: &str,
    operation: &str,
    expression: &str,
) -> Option<InterpretedSql> {
    let table = title_case(model);
    let mut limitations = Vec::new();
    let statement = match operation {
        "findFirst" | "findUnique" | "findFirstOrThrow" | "findUniqueOrThrow" => {
            select_statement(&table, expression, Some(1), &mut limitations)
        }
        "findMany" => {
            let limit = has_property(expression, "take").then_some(0);
            select_statement(&table, expression, limit, &mut limitations)
        }
        "count" => count_statement(&table, expression, &mut limitations),
        "create" | "createMany" => insert_statement(&table, expression, &mut limitations),
        "update" | "updateMany" => update_statement(&table, expression, &mut limitations),
        "delete" | "deleteMany" => delete_statement(&table, expression, &mut limitations),
        "upsert" => {
            limitations.push("Upsert conflict target is resolved by Prisma at runtime.".to_owned());
            format!("UPSERT INTO {table}\nUSING Prisma create/update payload")
        }
        _ => return None,
    };

    Some(InterpretedSql {
        statement,
        limitations,
    })
}

fn select_statement(
    table: &str,
    expression: &str,
    limit: Option<usize>,
    limitations: &mut Vec<String>,
) -> String {
    let columns = selected_columns(expression).unwrap_or_else(|| {
        limitations.push(
            "No explicit Prisma select was found; returned scalar columns depend on the schema."
                .to_owned(),
        );
        "*".to_owned()
    });
    let mut lines = vec![format!("SELECT {columns}"), format!("FROM {table}")];
    append_where(&mut lines, expression, limitations);
    if let Some(limit) = limit {
        lines.push(if limit == 0 {
            "LIMIT ?".to_owned()
        } else {
            format!("LIMIT {limit}")
        });
    }
    lines.join("\n")
}

fn count_statement(table: &str, expression: &str, limitations: &mut Vec<String>) -> String {
    let mut lines = vec!["SELECT COUNT(*)".to_owned(), format!("FROM {table}")];
    append_where(&mut lines, expression, limitations);
    lines.join("\n")
}

fn insert_statement(table: &str, expression: &str, limitations: &mut Vec<String>) -> String {
    let Some(data) = property_object(expression, "data") else {
        limitations.push("The Prisma data payload could not be resolved statically.".to_owned());
        return format!("INSERT INTO {table}\nVALUES (?)");
    };
    let columns = object_entries(data)
        .into_iter()
        .map(|(key, _)| key)
        .collect::<Vec<_>>();
    if columns.is_empty() {
        limitations.push("The Prisma data payload is dynamic.".to_owned());
        return format!("INSERT INTO {table}\nVALUES (?)");
    }
    let placeholders = vec!["?"; columns.len()].join(", ");
    format!(
        "INSERT INTO {table} ({})\nVALUES ({placeholders})",
        columns.join(", ")
    )
}

fn update_statement(table: &str, expression: &str, limitations: &mut Vec<String>) -> String {
    let assignments = property_object(expression, "data")
        .map(object_entries)
        .unwrap_or_default()
        .into_iter()
        .map(|(key, _)| format!("{key} = ?"))
        .collect::<Vec<_>>();
    let mut lines = vec![format!("UPDATE {table}")];
    if assignments.is_empty() {
        lines.push("SET <dynamic data>".to_owned());
        limitations.push("The Prisma update payload is dynamic.".to_owned());
    } else {
        lines.push(format!("SET {}", assignments.join(", ")));
    }
    append_where(&mut lines, expression, limitations);
    lines.join("\n")
}

fn delete_statement(table: &str, expression: &str, limitations: &mut Vec<String>) -> String {
    let mut lines = vec![format!("DELETE FROM {table}")];
    append_where(&mut lines, expression, limitations);
    lines.join("\n")
}

fn append_where(lines: &mut Vec<String>, expression: &str, limitations: &mut Vec<String>) {
    let Some(where_object) = property_object(expression, "where") else {
        return;
    };
    let conditions = object_entries(where_object)
        .into_iter()
        .filter_map(|(key, value)| condition(&key, &value, limitations))
        .collect::<Vec<_>>();
    if !conditions.is_empty() {
        lines.push(format!("WHERE {}", conditions.join(" AND ")));
    }
}

fn selected_columns(expression: &str) -> Option<String> {
    let select = property_object(expression, "select")?;
    let columns = object_entries(select)
        .into_iter()
        .filter(|(_, value)| value.trim() == "true")
        .map(|(key, _)| key)
        .collect::<Vec<_>>();
    (!columns.is_empty()).then(|| columns.join(", "))
}

fn condition(key: &str, value: &str, limitations: &mut Vec<String>) -> Option<String> {
    if key.starts_with("...") || matches!(key, "AND" | "OR" | "NOT") {
        limitations.push(format!("Complex `{key}` predicate was not expanded."));
        return None;
    }
    let value = value.trim();
    if value == "null" {
        return Some(format!("{key} IS NULL"));
    }
    if matches!(value, "true" | "false") || value.parse::<f64>().is_ok() {
        return Some(format!("{key} = {value}"));
    }
    if value.starts_with('{') && value.ends_with('}') {
        let nested = object_entries(&value[1..value.len() - 1]);
        if let Some((operator, operand)) = nested.first() {
            return Some(match operator.as_str() {
                "in" => format!("{key} IN (?)"),
                "notIn" => format!("{key} NOT IN (?)"),
                "gt" => format!("{key} > ?"),
                "gte" => format!("{key} >= ?"),
                "lt" => format!("{key} < ?"),
                "lte" => format!("{key} <= ?"),
                "not" if operand.trim() == "null" => format!("{key} IS NOT NULL"),
                "not" => format!("{key} <> ?"),
                "contains" => format!("{key} LIKE ?"),
                "startsWith" => format!("{key} LIKE ?"),
                "endsWith" => format!("{key} LIKE ?"),
                _ => {
                    limitations.push(format!("Predicate `{key}.{operator}` was simplified."));
                    format!("{key} = ?")
                }
            });
        }
    }
    Some(format!("{key} = ?"))
}

fn has_property(expression: &str, property: &str) -> bool {
    property_value(expression, property).is_some()
}

fn property_object<'a>(expression: &'a str, property: &str) -> Option<&'a str> {
    let value = property_value(expression, property)?;
    let open = value.find('{')?;
    let close = matching_delimiter(value, open, '{', '}')?;
    value.get(open + 1..close)
}

fn property_value<'a>(expression: &'a str, property: &str) -> Option<&'a str> {
    let root_open = expression.find('{')?;
    let root_close = matching_delimiter(expression, root_open, '{', '}')?;
    let root = expression.get(root_open + 1..root_close)?;
    for entry in split_top_level(root, ',') {
        let Some((key, value)) = split_once_top_level(entry, ':') else {
            continue;
        };
        if key.trim().trim_matches(['\'', '"']) == property {
            return Some(value.trim());
        }
    }
    None
}

fn matching_delimiter(source: &str, open_index: usize, open: char, close: char) -> Option<usize> {
    let mut depth = 0;
    let mut quote = None;
    let mut escaped = false;
    for (offset, character) in source[open_index..].char_indices() {
        if let Some(active_quote) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == active_quote {
                quote = None;
            }
            continue;
        }
        if matches!(character, '\'' | '"' | '`') {
            quote = Some(character);
        } else if character == open {
            depth += 1;
        } else if character == close {
            depth -= 1;
            if depth == 0 {
                return Some(open_index + offset);
            }
        }
    }
    None
}

fn object_entries(source: &str) -> Vec<(String, String)> {
    split_top_level(source, ',')
        .into_iter()
        .filter_map(|entry| {
            let entry = entry.trim();
            if entry.is_empty() {
                return None;
            }
            let parts = split_once_top_level(entry, ':');
            let (key, value) = parts.unwrap_or((entry, ""));
            let key = key.trim().trim_matches(['\'', '"']).to_owned();
            Some((key, value.trim().to_owned()))
        })
        .collect()
}

fn split_top_level(source: &str, delimiter: char) -> Vec<&str> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut depths = (0_u32, 0_u32, 0_u32);
    let mut quote = None;
    let mut escaped = false;
    for (index, character) in source.char_indices() {
        if let Some(active_quote) = quote {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' | '`' => quote = Some(character),
            '{' => depths.0 += 1,
            '}' => depths.0 = depths.0.saturating_sub(1),
            '[' => depths.1 += 1,
            ']' => depths.1 = depths.1.saturating_sub(1),
            '(' => depths.2 += 1,
            ')' => depths.2 = depths.2.saturating_sub(1),
            _ if character == delimiter && depths == (0, 0, 0) => {
                result.push(&source[start..index]);
                start = index + character.len_utf8();
            }
            _ => {}
        }
    }
    result.push(&source[start..]);
    result
}

fn split_once_top_level(source: &str, delimiter: char) -> Option<(&str, &str)> {
    let first = split_top_level(source, delimiter);
    if first.len() < 2 {
        return None;
    }
    let index = first[0].len();
    Some((&source[..index], &source[index + delimiter.len_utf8()..]))
}

fn title_case(value: &str) -> String {
    let mut characters = value.chars();
    characters.next().map_or_else(String::new, |first| {
        first.to_uppercase().collect::<String>() + characters.as_str()
    })
}

#[cfg(test)]
mod tests {
    use super::interpret_prisma_call;

    #[test]
    fn interprets_prisma_find_first_as_readable_sql() {
        let preview = interpret_prisma_call(
            "discount",
            "findFirst",
            "prisma.discount.findFirst({ select: { id: true, code: true, amount: true }, where: { code, deleted: false } })",
        )
        .expect("supported Prisma call should be interpreted");

        assert_eq!(
            preview.statement,
            "SELECT id, code, amount\nFROM Discount\nWHERE code = ? AND deleted = false\nLIMIT 1"
        );
        assert!(preview.limitations.is_empty());
    }

    #[test]
    fn calls_out_dynamic_default_projection() {
        let preview = interpret_prisma_call(
            "event",
            "findMany",
            "prisma.event.findMany({ where: { organizationId } })",
        )
        .expect("supported Prisma call should be interpreted");

        assert!(preview.statement.starts_with("SELECT *\nFROM Event"));
        assert_eq!(preview.limitations.len(), 1);
    }
}
