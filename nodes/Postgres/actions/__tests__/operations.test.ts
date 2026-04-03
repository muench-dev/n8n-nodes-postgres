import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../transport', () => ({
	createDb: vi.fn(),
}));

import { createDb } from '../../transport';
import * as listSchemas from '../listSchemas.operation';
import * as listTables from '../listTables.operation';
import * as listViews from '../listViews.operation';
import * as rowCountThreshold from '../rowCountThreshold.operation';
import * as rowExists from '../rowExists.operation';
import * as rowNotExists from '../rowNotExists.operation';
import * as valueChanged from '../valueChanged.operation';

type MockDb = {
	any: ReturnType<typeof vi.fn>;
	one: ReturnType<typeof vi.fn>;
	oneOrNone: ReturnType<typeof vi.fn>;
	$pool: {
		end: ReturnType<typeof vi.fn>;
	};
};

function createMockDb(): MockDb {
	return {
		any: vi.fn(),
		one: vi.fn(),
		oneOrNone: vi.fn(),
		$pool: {
			end: vi.fn().mockResolvedValue(undefined),
		},
	};
}

function createContext(options: {
	parameters: Record<string, unknown[]>;
	credentials?: Record<string, unknown>;
	continueOnFail?: boolean;
}): IExecuteFunctions {
	const { parameters, credentials = {}, continueOnFail = false } = options;

	return {
		getCredentials: vi.fn().mockResolvedValue(credentials),
		getNodeParameter: vi.fn((name: string, itemIndex: number, ...rest: unknown[]) => {
			const values = parameters[name];
			const rawValue = values?.[itemIndex] ?? values?.[0];
			const optionsArg = rest[rest.length - 1] as { extractValue?: boolean } | undefined;

			if (
				optionsArg?.extractValue === true &&
				rawValue !== null &&
				typeof rawValue === 'object' &&
				'value' in (rawValue as Record<string, unknown>)
			) {
				return (rawValue as { value: unknown }).value;
			}

			return rawValue;
		}),
		getNode: vi.fn().mockReturnValue({ name: 'Postgres Extended' }),
		continueOnFail: vi.fn().mockReturnValue(continueOnFail),
	} as unknown as IExecuteFunctions;
}

const mockedCreateDb = vi.mocked(createDb);
const credentials = {
	host: 'localhost',
	port: 5432,
	database: 'db',
	user: 'user',
	password: 'pass',
};

describe('Postgres operations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('listSchemas', () => {
		it('returns schemas on the main output', async () => {
			const db = createMockDb();
			db.any.mockResolvedValue([{ schema_name: 'public' }, { schema_name: 'custom' }]);
			mockedCreateDb.mockReturnValue(db as never);

			const context = createContext({ parameters: {}, credentials });
			const [output] = await listSchemas.execute(context, [{ json: {} }]);

			expect(output).toEqual([
				{ json: { schemaName: 'public' }, pairedItem: { item: 0 } },
				{ json: { schemaName: 'custom' }, pairedItem: { item: 0 } },
			]);
			expect(db.$pool.end).toHaveBeenCalledTimes(1);
		});
	});

	describe('listTables', () => {
		it('returns base tables for the selected schema', async () => {
			const db = createMockDb();
			db.any.mockResolvedValue([{ table_name: 'users', table_schema: 'public' }]);
			mockedCreateDb.mockReturnValue(db as never);

			const context = createContext({
				parameters: { schema: [{ value: 'public' }] },
				credentials,
			});

			const [output] = await listTables.execute(context, [{ json: {} }]);

			expect(db.any).toHaveBeenCalledWith(expect.stringContaining("table_type='BASE TABLE'"), [
				'public',
			]);
			expect(output).toEqual([
				{ json: { tableName: 'users', schemaName: 'public' }, pairedItem: { item: 0 } },
			]);
		});
	});

	describe('listViews', () => {
		it('returns views for the selected schema', async () => {
			const db = createMockDb();
			db.any.mockResolvedValue([{ table_name: 'active_users', table_schema: 'public' }]);
			mockedCreateDb.mockReturnValue(db as never);

			const context = createContext({
				parameters: { schema: [{ value: 'public' }] },
				credentials,
			});

			const [output] = await listViews.execute(context, [{ json: {} }]);

			expect(output).toEqual([
				{ json: { viewName: 'active_users', schemaName: 'public' }, pairedItem: { item: 0 } },
			]);
		});
	});

	describe('rowExists', () => {
		it('outputs only items that have a matching row', async () => {
			const db = createMockDb();
			db.any.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([]);
			mockedCreateDb.mockReturnValue(db as never);

			const items: INodeExecutionData[] = [{ json: { id: 1 } }, { json: { id: 2 } }];
			const context = createContext({
				parameters: {
					schema: [{ value: 'public' }, { value: 'public' }],
					table: [{ value: 'users' }, { value: 'users' }],
					matchType: ['allConditions', 'allConditions'],
					conditions: [
						{ values: [{ column: 'id', operator: 'equal', value: '1' }] },
						{ values: [{ column: 'id', operator: 'equal', value: '2' }] },
					],
				},
				credentials,
			});

			const [output] = await rowExists.execute(context, items);

			expect(output).toEqual([{ json: { id: 1 }, pairedItem: { item: 0 } }]);
		});
	});

	describe('rowNotExists', () => {
		it('outputs only items that do not have a matching row', async () => {
			const db = createMockDb();
			db.any.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([]);
			mockedCreateDb.mockReturnValue(db as never);

			const items: INodeExecutionData[] = [{ json: { id: 1 } }, { json: { id: 2 } }];
			const context = createContext({
				parameters: {
					schema: [{ value: 'public' }, { value: 'public' }],
					table: [{ value: 'users' }, { value: 'users' }],
					matchType: ['allConditions', 'allConditions'],
					conditions: [
						{ values: [{ column: 'id', operator: 'equal', value: '1' }] },
						{ values: [{ column: 'id', operator: 'equal', value: '2' }] },
					],
				},
				credentials,
			});

			const [output] = await rowNotExists.execute(context, items);

			expect(output).toEqual([{ json: { id: 2 }, pairedItem: { item: 1 } }]);
		});
	});

	describe('rowCountThreshold', () => {
		it('outputs only items whose row count meets the threshold', async () => {
			const db = createMockDb();
			db.one.mockResolvedValueOnce({ cnt: '3' }).mockResolvedValueOnce({ cnt: '1' });
			mockedCreateDb.mockReturnValue(db as never);

			const items: INodeExecutionData[] = [{ json: { id: 1 } }, { json: { id: 2 } }];
			const context = createContext({
				parameters: {
					schema: [{ value: 'public' }, { value: 'public' }],
					table: [{ value: 'users' }, { value: 'users' }],
					threshold: [2, 2],
					thresholdOperator: ['atLeast', 'atLeast'],
					matchType: ['allConditions', 'allConditions'],
					conditions: [
						{ values: [{ column: 'status', operator: 'equal', value: 'active' }] },
						{ values: [{ column: 'status', operator: 'equal', value: 'inactive' }] },
					],
				},
				credentials,
			});

			const [output] = await rowCountThreshold.execute(context, items);

			expect(output).toEqual([
				{ json: { id: 1, rowCount: 3, threshold: 2 }, pairedItem: { item: 0 } },
			]);
		});
	});

	describe('valueChanged', () => {
		it('outputs only items whose watched value changed', async () => {
			const db = createMockDb();
			db.oneOrNone
				.mockResolvedValueOnce({ current_value: 'published' })
				.mockResolvedValueOnce({ current_value: 'draft' });
			mockedCreateDb.mockReturnValue(db as never);

			const items: INodeExecutionData[] = [{ json: { id: 1 } }, { json: { id: 2 } }];
			const context = createContext({
				parameters: {
					schema: [{ value: 'public' }, { value: 'public' }],
					table: [{ value: 'posts' }, { value: 'posts' }],
					matchType: ['allConditions', 'allConditions'],
					conditions: [
						{ values: [{ column: 'id', operator: 'equal', value: '1' }] },
						{ values: [{ column: 'id', operator: 'equal', value: '2' }] },
					],
					watchColumn: ['status', 'status'],
					expectedValue: ['draft', 'draft'],
				},
				credentials,
			});

			const [output] = await valueChanged.execute(context, items);

			expect(output).toEqual([
				{
					json: { id: 1, currentValue: 'published', expectedValue: 'draft' },
					pairedItem: { item: 0 },
				},
			]);
		});
	});
});
