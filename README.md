# @muench-dev/n8n-nodes-postgres

`@muench-dev/n8n-nodes-postgres` is an n8n community node that adds Postgres checks and metadata lookups that are not covered by the built-in Postgres node.

It is designed for workflows that need to filter incoming items based on database state, detect changes in a tracked column, or inspect schemas, tables, and views directly from PostgreSQL.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

For a self-hosted n8n instance, you can also install the package directly:

```bash
npm install @muench-dev/n8n-nodes-postgres
```

After installation, restart n8n and search for `Postgres Extended` in the node picker.

## Operations

The package currently provides one node: `Postgres Extended`.

Supported operations:

| Resource | Operation           | What it does                                                              |
| -------- | ------------------- | ------------------------------------------------------------------------- |
| Check    | Row Exists          | Outputs only items for which at least one matching row exists             |
| Check    | Row Does Not Exist  | Outputs only items for which no matching row exists                       |
| Check    | Row Count Threshold | Outputs only items whose matching row count satisfies a threshold         |
| Check    | Value Has Changed   | Outputs only items where a watched column differs from the expected value |
| Metadata | List Schemas        | Returns database schemas                                                  |
| Metadata | List Tables         | Returns base tables for a selected schema                                 |
| Metadata | List Views          | Returns views for a selected schema                                       |

## Credentials

This package does not ship its own credential type.

`Postgres Extended` reuses n8n's built-in `postgres` credential, so you can point it at the same database connections you already use with the core Postgres node.

Typical setup:

1. Create or reuse a standard Postgres credential in n8n.
2. Configure host, port, database, username, password, and SSL settings as needed.
3. Select that credential in `Postgres Extended`.

The node uses the same connection details supported by the core credential, including SSL-enabled connections.

## Compatibility

- Built as an n8n community node package using `n8nNodesApiVersion: 1`
- Depends on the built-in n8n `postgres` credential being available
- Best suited for current self-hosted n8n versions that support community nodes and the core Postgres node

If you run an older n8n release and the built-in Postgres credential differs from current n8n behavior, verify the node in a staging environment first.

## Usage

### Check operations

All check operations work item-by-item. The node evaluates the configured schema, table, and conditions for each incoming item and only forwards items that match the selected rule.

Available condition operators:

- `Equal`
- `Not Equal`
- `Like`
- `Greater Than`
- `Less Than`
- `Greater Than Or Equal`
- `Less Than Or Equal`
- `Is Null`
- `Is Not Null`

You can combine conditions with either:

- `All Conditions`
- `Any Condition`

### Row Exists

Use this when a workflow item should continue only if a matching row is already present.

Example: continue only if `public.users` contains a row where `email = {{$json.email}}`.

### Row Does Not Exist

Use this to prevent duplicates.

Example: continue only if `public.users` does not contain a row where `external_id = {{$json.id}}`.

### Row Count Threshold

This operation compares the number of matching rows against a threshold using one of these comparisons:

- `At Least`
- `More Than`
- `Exactly`
- `Less Than`
- `At Most`

When an item matches, the node adds these fields to the output JSON:

- `rowCount`
- `threshold`

### Value Has Changed

Use this to detect whether a database value is no longer what you expect.

You provide:

- conditions to identify the row
- a `Watch Column`
- an `Expected Value`

When the current database value differs from the expected value, the item is forwarded and enriched with:

- `currentValue`
- `expectedValue`

This is useful for change detection, status monitoring, and guarding downstream steps.

### Metadata operations

Metadata operations ignore item content and return database structure information instead:

- `List Schemas` returns `schemaName`
- `List Tables` returns `tableName` and `schemaName`
- `List Views` returns `viewName` and `schemaName`

### Notes

- Schema and table names can be selected from n8n resource pickers or entered manually.
- Column options are loaded dynamically from the selected table.
- `LIKE` supports PostgreSQL wildcard matching such as `%` and `_`.
- `Value Has Changed` requires at least one matching row. If none is found, the node errors unless `Continue On Fail` is enabled.
- `Continue On Fail` is supported, so per-item database errors can be emitted as error items instead of failing the whole execution.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [n8n Postgres node documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)

## Version history

### 0.2.1

Current package version.

Includes:

- `Postgres Extended` node
- check operations for row existence, row absence, row count thresholds, and value change detection
- metadata operations for schemas, tables, and views
