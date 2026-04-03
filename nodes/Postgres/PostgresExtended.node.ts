import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import * as listSchemas from './actions/listSchemas.operation';
import * as listTables from './actions/listTables.operation';
import * as listViews from './actions/listViews.operation';
import * as rowCountThreshold from './actions/rowCountThreshold.operation';
import * as rowExists from './actions/rowExists.operation';
import * as rowNotExists from './actions/rowNotExists.operation';
import * as valueChanged from './actions/valueChanged.operation';
import { createDb, type PostgresCredentials } from './transport';

const CHECK_OPERATIONS = ['rowExists', 'rowNotExists', 'rowCountThreshold', 'valueChanged'];
// Operations that require schema + table + conditions
const SCHEMA_TABLE_CONDITIONS_OPERATIONS = CHECK_OPERATIONS;
// Operations that require only schema (list operations)
const SCHEMA_ONLY_OPERATIONS = ['listTables', 'listViews'];
// All operations that show the schema picker
const SCHEMA_OPERATIONS = [...SCHEMA_TABLE_CONDITIONS_OPERATIONS, ...SCHEMA_ONLY_OPERATIONS];

export class PostgresExtended implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Postgres Extended',
		name: 'postgresExtended',
		icon: 'file:postgres.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Extended Postgres operations to complement the built-in Postgres node',
		defaults: {
			name: 'Postgres Extended',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				// Intentionally references the built-in postgres credential so users can reuse
				// existing Postgres connections configured for n8n's core Postgres node.
				// eslint-disable-next-line @n8n/community-nodes/no-credential-reuse
				name: 'postgres',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Check',
						value: 'check',
						description: 'Check rows and output only items that match',
					},
					{
						name: 'Metadata',
						value: 'metadata',
						description: 'List database schemas, tables, and views',
					},
				],
				default: 'check',
			},

			// ── Operation ─────────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['check'] } },
				options: [
					{
						name: 'Row Exists',
						value: 'rowExists',
						description: 'Output items when a matching row exists',
						action: 'Check if a row exists',
					},
					{
						name: 'Row Does Not Exist',
						value: 'rowNotExists',
						description: 'Output items when no matching row exists',
						action: 'Check if a row does not exist',
					},
					{
						name: 'Row Count Threshold',
						value: 'rowCountThreshold',
						description: 'Output items when the number of matching rows meets a threshold',
						action: 'Check if row count meets a threshold',
					},
					{
						name: 'Value Has Changed',
						value: 'valueChanged',
						description: 'Output items when a column value differs from the expected value',
						action: 'Check if a column value has changed',
					},
				],
				default: 'rowExists',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['metadata'] } },
				options: [
					{
						name: 'List Schemas',
						value: 'listSchemas',
						description: 'Return all schemas in the database',
						action: 'List all schemas',
					},
					{
						name: 'List Tables',
						value: 'listTables',
						description: 'Return all tables in a schema',
						action: 'List all tables in a schema',
					},
					{
						name: 'List Views',
						value: 'listViews',
						description: 'Return all views in a schema',
						action: 'List all views in a schema',
					},
				],
				default: 'listSchemas',
			},

			// ── Schema (all ops except listSchemas) ───────────────────────────────
			{
				displayName: 'Schema',
				name: 'schema',
				type: 'resourceLocator',
				default: { mode: 'list', value: 'public' },
				required: true,
				placeholder: 'e.g. public',
				description: 'The schema that contains the table you want to work on',
				displayOptions: { show: { operation: SCHEMA_OPERATIONS } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'schemaSearch' },
					},
					{
						displayName: 'By Name',
						name: 'name',
						type: 'string',
					},
				],
			},

			// ── Table (schema+table operations only) ──────────────────────────────
			{
				displayName: 'Table',
				name: 'table',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The table you want to work on',
				displayOptions: { show: { operation: SCHEMA_TABLE_CONDITIONS_OPERATIONS } },
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: { searchListMethod: 'tableSearch' },
					},
					{
						displayName: 'By Name',
						name: 'name',
						type: 'string',
					},
				],
			},

			// ── Must Match + Conditions (shared, shown for all schema+table ops) ──
			{
				displayName: 'Must Match',
				name: 'matchType',
				type: 'options',
				options: [
					{
						name: 'All Conditions',
						value: 'allConditions',
						description: 'A row must satisfy every condition',
					},
					{
						name: 'Any Condition',
						value: 'anyCondition',
						description: 'A row must satisfy at least one condition',
					},
				],
				default: 'allConditions',
				displayOptions: { show: { operation: SCHEMA_TABLE_CONDITIONS_OPERATIONS } },
			},
			{
				displayName: 'Conditions',
				name: 'conditions',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: { values: [] },
				description: 'Column/value pairs used to match rows',
				displayOptions: { show: { operation: SCHEMA_TABLE_CONDITIONS_OPERATIONS } },
				options: [
					{
						name: 'values',
						displayName: 'Condition',
						values: [
							{
								// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
								displayName: 'Column',
								name: 'column',
								type: 'options',
								// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
								description:
									'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>',
								default: '',
								placeholder: 'e.g. ID',
								typeOptions: {
									loadOptionsMethod: 'getColumns',
									loadOptionsDependsOn: ['schema.value', 'table.value'],
								},
							},
							{
								displayName: 'Operator',
								name: 'operator',
								type: 'options',
								// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
								options: [
									{ name: 'Equal', value: 'equal' },
									{ name: 'Not Equal', value: '!=' },
									{ name: 'Like', value: 'LIKE' },
									{ name: 'Greater Than', value: '>' },
									{ name: 'Less Than', value: '<' },
									{ name: 'Greater Than Or Equal', value: '>=' },
									{ name: 'Less Than Or Equal', value: '<=' },
									{ name: 'Is Null', value: 'IS NULL' },
									{ name: 'Is Not Null', value: 'IS NOT NULL' },
								],
								default: 'equal',
								description:
									"The operator to check the column against. When using 'LIKE', percent sign (%) matches zero or more characters, underscore (_) matches any single character.",
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'The value to compare the column against',
								displayOptions: { hide: { operator: ['IS NULL', 'IS NOT NULL'] } },
							},
						],
					},
				],
			},

			// ── Row Count Threshold specific ──────────────────────────────────────
			{
				displayName: 'Threshold',
				name: 'threshold',
				type: 'number',
				required: true,
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'The row count to compare against',
				displayOptions: { show: { operation: ['rowCountThreshold'] } },
			},
			{
				displayName: 'Comparison',
				name: 'thresholdOperator',
				type: 'options',
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
				options: [
					{ name: 'At Least', value: 'atLeast', description: 'Count ≥ threshold' },
					{ name: 'More Than', value: 'moreThan', description: 'Count > threshold' },
					{ name: 'Exactly', value: 'exactly', description: 'Count = threshold' },
					{ name: 'Less Than', value: 'lessThan', description: 'Count < threshold' },
					{ name: 'At Most', value: 'atMost', description: 'Count ≤ threshold' },
				],
				default: 'atLeast',
				description: 'How to compare the row count against the threshold',
				displayOptions: { show: { operation: ['rowCountThreshold'] } },
			},

			// ── Value Has Changed specific ─────────────────────────────────────────
			{
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
				displayName: 'Watch Column',
				name: 'watchColumn',
				type: 'options',
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/" target="_blank">expression</a>',
				default: '',
				placeholder: 'e.g. status',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getColumns',
					loadOptionsDependsOn: ['schema.value', 'table.value'],
				},
				displayOptions: { show: { operation: ['valueChanged'] } },
			},
			{
				displayName: 'Expected Value',
				name: 'expectedValue',
				type: 'string',
				default: '',
				required: true,
				description:
					"The value the column is expected to still hold. Use an expression to reference the previous run's value, e.g. <code>{{ $JSON.status }}</code>.",
				displayOptions: { show: { operation: ['valueChanged'] } },
			},
		],
	};

	methods = {
		loadOptions: {
			async getColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = (await this.getCredentials('postgres')) as PostgresCredentials;
				const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
				const table = this.getNodeParameter('table', 0, { extractValue: true }) as string;
				const db = createDb(credentials);
				try {
					const rows = await db.any(
						`SELECT column_name, data_type, is_nullable
						 FROM information_schema.columns
						 WHERE table_schema=$1 AND table_name=$2
						 ORDER BY ordinal_position`,
						[schema, table],
					);
					return rows.map((row) => ({
						name: row.column_name as string,
						value: row.column_name as string,
						description: `Type: ${(row.data_type as string).toUpperCase()}, Nullable: ${row.is_nullable}`,
					}));
				} finally {
					await db.$pool.end();
				}
			},
		},

		listSearch: {
			async schemaSearch(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const credentials = (await this.getCredentials('postgres')) as PostgresCredentials;
				const db = createDb(credentials);
				try {
					const rows = await db.any(
						'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name',
					);
					return {
						results: rows.map((row) => ({
							name: row.schema_name as string,
							value: row.schema_name as string,
						})),
					};
				} finally {
					await db.$pool.end();
				}
			},

			async tableSearch(this: ILoadOptionsFunctions): Promise<INodeListSearchResult> {
				const credentials = (await this.getCredentials('postgres')) as PostgresCredentials;
				const schema = this.getNodeParameter('schema', 0, { extractValue: true }) as string;
				const db = createDb(credentials);
				try {
					const rows = await db.any(
						`SELECT table_name
						 FROM information_schema.tables
						 WHERE table_schema=$1 AND table_type='BASE TABLE'
						 ORDER BY table_name`,
						[schema],
					);
					return {
						results: rows.map((row) => ({
							name: row.table_name as string,
							value: row.table_name as string,
						})),
					};
				} finally {
					await db.$pool.end();
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;

		if (operation === 'rowExists') return await rowExists.execute(this, items);
		if (operation === 'rowNotExists') return await rowNotExists.execute(this, items);
		if (operation === 'rowCountThreshold') return await rowCountThreshold.execute(this, items);
		if (operation === 'valueChanged') return await valueChanged.execute(this, items);
		if (operation === 'listSchemas') return await listSchemas.execute(this, items);
		if (operation === 'listTables') return await listTables.execute(this, items);
		if (operation === 'listViews') return await listViews.execute(this, items);

		throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
	}
}
