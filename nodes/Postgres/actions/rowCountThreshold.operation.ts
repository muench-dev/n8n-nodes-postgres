import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { createDb, type PostgresCredentials } from '../transport';
import { buildWhereClause, escapeIdentifier, type Condition } from './utils';

type ThresholdOperator = 'atLeast' | 'moreThan' | 'exactly' | 'lessThan' | 'atMost';

function meetsThreshold(count: number, threshold: number, op: ThresholdOperator): boolean {
	switch (op) {
		case 'atLeast':
			return count >= threshold;
		case 'moreThan':
			return count > threshold;
		case 'exactly':
			return count === threshold;
		case 'lessThan':
			return count < threshold;
		case 'atMost':
			return count <= threshold;
	}
}

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
				const threshold = context.getNodeParameter('threshold', i) as number;
				const thresholdOperator = context.getNodeParameter(
					'thresholdOperator',
					i,
					'atLeast',
				) as ThresholdOperator;
				const matchType = context.getNodeParameter('matchType', i, 'allConditions') as string;
				const conditionsData = context.getNodeParameter('conditions', i) as {
					values?: Condition[];
				};
				const conditions = conditionsData.values ?? [];

				const { whereClause, values } = buildWhereClause(conditions, matchType);
				const query = `SELECT COUNT(*) AS cnt FROM ${escapeIdentifier(schema)}.${escapeIdentifier(table)}${whereClause}`;

				const row = await db.one(query, values);
				const rowCount = parseInt(row.cnt as string, 10);
				const enriched = {
					...items[i],
					json: { ...items[i].json, rowCount, threshold },
					pairedItem: { item: i },
				};

				if (meetsThreshold(rowCount, threshold, thresholdOperator)) {
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
