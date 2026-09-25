# Security policy

## Supported versions

Backend Story is an early prototype and does not yet have stable release
branches. Security fixes are applied to the latest `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting for this repository:

`https://github.com/mohit-kota/backend-story/security/advisories/new`

Include the affected revision, reproduction steps, impact, and any suggested
mitigation. Please remove proprietary source code, secrets, and personal data
from reports.

You should receive an acknowledgement within seven days. The project will
coordinate disclosure after the report is validated and a remediation is
available.

## Scope notes

Particularly useful reports include unsafe filesystem behavior, unintended
source or secret disclosure, command execution, Tauri capability bypasses, and
unexpected transmission of repository content to an external service.

Backend Story is not a security scanner, and its analysis findings should not
be treated as a security guarantee.
