use std::path::Path;

use analyzer_core::{ContractEdgeKind, ContractNodeKind, analyze_project};

#[test]
fn analyzes_typescript_fixture() {
    let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let report = analyze_project(&fixture_root).expect("fixture should analyze");

    assert_eq!(report.summary.total_files, 1);
    assert_eq!(report.summary.imports, 2);
    assert!(report.summary.functions >= 2);
    assert_eq!(report.summary.classes, 2);
    assert_eq!(report.summary.routes, 1);

    let contract = report
        .contracts
        .first()
        .expect("route should become a contract");
    assert_eq!(contract.method, "GET");
    assert_eq!(contract.path, "/events");
    assert!(
        contract
            .nodes
            .iter()
            .any(|node| node.label == "EventService.list" && node.kind == ContractNodeKind::Service)
    );
    assert!(
        contract.nodes.iter().any(|node| {
            node.label == "event.findMany" && node.kind == ContractNodeKind::Database
        })
    );
    let database_nodes = contract
        .nodes
        .iter()
        .filter(|node| node.kind == ContractNodeKind::Database)
        .collect::<Vec<_>>();
    assert_eq!(database_nodes.len(), 3);
    let find_many_access = database_nodes
        .iter()
        .filter_map(|node| node.data_access.as_ref())
        .filter(|access| access.operation == "findMany")
        .collect::<Vec<_>>();
    assert_eq!(find_many_access.len(), 2);
    let first_access = find_many_access[0];
    let second_access = find_many_access[1];
    assert_eq!(first_access.fingerprint, second_access.fingerprint);
    assert_eq!(first_access.shape_fingerprint, "event:findmany");
    assert!(first_access.expression.starts_with("prisma.event.findMany"));
    assert!(database_nodes.iter().any(|node| {
        node.data_access
            .as_ref()
            .is_some_and(|access| access.operation == "count")
    }));
    assert!(
        contract
            .edges
            .iter()
            .any(|edge| edge.kind == ContractEdgeKind::Reads)
    );
}
