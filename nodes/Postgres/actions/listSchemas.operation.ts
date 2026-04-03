import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { createDb, type PostgresCredentials } from '../transport';

export async function execute(
	context: IExecuteFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[][]> {
	const pairedItemIndex = items.length > 0 ? 0 : undefined;
	const credentials = (await context.getCredentials('postgres')) as PostgresCredentials;
	const db = createDb(credentials);

	try {
		const rows = await db.any(
			'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name',
		);

		const results: INodeExecutionData[] = rows.map((row) => ({
			json: { schemaName: row.schema_name as string },
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
