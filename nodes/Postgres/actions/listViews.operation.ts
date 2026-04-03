import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { createDb, type PostgresCredentials } from '../transport';

export async function execute(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
	const pairedItemIndex = items.length > 0 ? 0 : undefined;
	const credentials = (await context.getCredentials('postgres')) as PostgresCredentials;
	const schema = context.getNodeParameter('schema', 0, undefined, { extractValue: true }) as string;
	const db = createDb(credentials);

	try {
		const rows = await db.any(
			`SELECT table_name, table_schema
			 FROM information_schema.views
			 WHERE table_schema=$1
			 ORDER BY table_name`,
			[schema],
		);

		const results: INodeExecutionData[] = rows.map((row) => ({
			json: {
				viewName: row.table_name as string,
				schemaName: row.table_schema as string,
			},
			pairedItem: pairedItemIndex === undefined ? undefined : { item: pairedItemIndex },
		}));

		return [results];
	} catch (error) {
		if (context.continueOnFail()) {
			return [
				[
					{
						json: { error: (error as Error).message },
						pairedItem: pairedItemIndex === undefined ? undefined : { item: pairedItemIndex },
					},
				],
			];
		}
		throw new NodeOperationError(context.getNode(), error as Error);
	} finally {
		await db.$pool.end();
	}
}
