import pgPromise from 'pg-promise';
import type pg from 'pg-promise/typescript/pg-subset';

export type PostgresCredentials = {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	ssl?: 'disable' | 'allow' | 'require' | 'verify' | 'verify-full';
	allowUnauthorizedCerts?: boolean;
};

export function buildDbConfig(credentials: PostgresCredentials): pg.IConnectionParameters {
	const dbConfig: pg.IConnectionParameters = {
		host: credentials.host,
		port: credentials.port,
		database: credentials.database,
		user: credentials.user,
		password: credentials.password,
	};

	if (credentials.allowUnauthorizedCerts) {
		dbConfig.ssl = { rejectUnauthorized: false };
	} else if (credentials.ssl && !['disable', undefined].includes(credentials.ssl)) {
		dbConfig.ssl = true;
	}

	return dbConfig;
}

export function createDb(credentials: PostgresCredentials): pgPromise.IDatabase<object> {
	const pgp = pgPromise({ noWarnings: true });
	return pgp(buildDbConfig(credentials));
}
