import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
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

				if (conditions.length === 0) {
					throw new NodeOperationError(context.getNode(), 'At least one condition is required', {
						itemIndex: i,
					});
				}

				const { whereClause, values } = buildWhereClause(conditions, matchType);
				const query = `SELECT 1 FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}${whereClause} LIMIT 1`;

				const rows = await db.any(query, values);

				if (rows.length > 0) {
					matchedItems.push({ ...items[i], pairedItem: { item: i } });
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
