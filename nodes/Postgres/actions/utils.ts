export type Condition = {
	column: string;
	operator: string;
	value: string;
};

type WhereFragment = {
	clause: string;
	value?: string | number;
};

export function escapeIdentifier(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

function buildWhereFragment(cond: Condition, paramIndex: number): WhereFragment {
	const col = escapeIdentifier(cond.column);
	const op = cond.operator === 'equal' ? '=' : cond.operator;

	if (op === 'IS NULL' || op === 'IS NOT NULL') {
		return { clause: `${col} ${op}` };
	}

	// For comparison operators, coerce to number when the value looks numeric
	// (mirrors the core Postgres node behaviour in addWhereClauses)
	let paramValue: string | number = String(cond.value);
	if (['>', '<', '>=', '<='].includes(op)) {
		const numeric = Number(cond.value);
		if (String(cond.value).trim() !== '' && !Number.isNaN(numeric)) {
			paramValue = numeric;
		}
	}

	return { clause: `${col} ${op} $${paramIndex}`, value: paramValue };
}

export function buildWhereClause(
	conditions: Condition[],
	matchType: string,
): { whereClause: string; values: Array<string | number> } {
	if (conditions.length === 0) return { whereClause: '', values: [] };

	const joinOperator = matchType === 'anyCondition' ? ' OR ' : ' AND ';
	const clauses: string[] = [];
	const values: Array<string | number> = [];

	for (const cond of conditions) {
		const fragment = buildWhereFragment(cond, values.length + 1);
		clauses.push(fragment.clause);
		if (fragment.value !== undefined) {
			values.push(fragment.value);
		}
	}

	return { whereClause: ` WHERE ${clauses.join(joinOperator)}`, values };
}
