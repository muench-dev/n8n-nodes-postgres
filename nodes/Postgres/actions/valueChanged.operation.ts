import type {
	GenericValue,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { createDb, type PostgresCredentials } from '../transport';
import { buildWhereClause, escapeIdentifier, type Condition } from './utils';

export async function execute(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
	const matchedItems: INodeExecutionData[] = [];

	const credentials = (await context.getCredentials('postgres')) as PostgresCredentials;
	const db = createDb(credentials);

	try {
		for (let i = 0; i < items.length; i++) {
			try {
				const schema = context.getNodeParameter('schema', i, undefined, {
					extractValue: true,
				}) as string;
				const table = context.getNodeParameter('table', i, undefined, {
					extractValue: true,
				}) as string;
				const matchType = context.getNodeParameter('matchType', i, 'allConditions') as string;
				const conditionsData = context.getNodeParameter('conditions', i) as {
					values?: Condition[];
				};
				const conditions = conditionsData.values ?? [];
				const watchColumn = context.getNodeParameter('watchColumn', i) as string;
				const expectedValue = context.getNodeParameter('expectedValue', i) as string;

				if (conditions.length === 0) {
					throw new NodeOperationError(
						context.getNode(),
						'At least one condition is required to identify the row',
						{ itemIndex: i },
					);
				}

				const { whereClause, values } = buildWhereClause(conditions, matchType);
				const query = `SELECT ${escapeIdentifier(watchColumn)} AS current_value FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}${whereClause} LIMIT 1`;

				const row = await db.oneOrNone(query, values);

				if (row === null) {
					throw new NodeOperationError(context.getNode(), 'No row matched the given conditions', {
						itemIndex: i,
					});
				}

				const currentValue = row.current_value as
					| GenericValue
					| IDataObject
					| GenericValue[]
					| IDataObject[];
				const changed = String(currentValue) !== String(expectedValue);
				const enriched = {
					...items[i],
					json: { ...items[i].json, currentValue, expectedValue },
					pairedItem: { item: i },
				};

				if (changed) {
					matchedItems.push(enriched);
				}
			} catch (error) {
				if (context.continueOnFail()) {
					matchedItems.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeOperationError(context.getNode(), error as Error, { itemIndex: i });
			}
		}
	} finally {
		await db.$pool.end();
	}

	return [matchedItems];
}
