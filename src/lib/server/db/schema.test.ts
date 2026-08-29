import { describe, expect, it } from 'vitest';
import { getTableName, getTableColumns, createTableRelationsHelpers, Many, One } from 'drizzle-orm';
import {
	plans,
	user,
	session,
	account,
	verification,
	userRelations,
	sessionRelations,
	accountRelations
} from './schema';

// issue #62: スキーマ定義のリグレッションテスト。
// 特に account.issuer は Better Auth のランタイムが読み書きするコアフィールドで、
// CLI生成結果には現れないため、うっかり削ると既存の認証が全て停止する（issue #42 で判明）。
// 消えたらここで落ちるようにしておく。

/** テーブルのカラム名（DB上の実名）を集合で返す。 */
function columnNames(table: Parameters<typeof getTableColumns>[0]) {
	return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

/** テーブルのカラムをDB上の実名で引く。 */
function column(table: Parameters<typeof getTableColumns>[0], name: string) {
	return Object.values(getTableColumns(table)).find((c) => c.name === name);
}

describe('テーブル名', () => {
	it.each([
		[plans, 'plans'],
		[user, 'user'],
		[session, 'session'],
		[account, 'account'],
		[verification, 'verification']
	])('%#: 期待どおりのテーブル名を持つ', (table, name) => {
		expect(getTableName(table)).toBe(name);
	});
});

describe('plans', () => {
	it('共有URL発行に必要なカラムを持つ', () => {
		expect(columnNames(plans)).toEqual(new Set(['id', 'share_id', 'data', 'created_at']));
	});

	it('share_idを一意にする', () => {
		expect(column(plans, 'share_id')?.isUnique).toBe(true);
	});

	it('share_idとdataを必須にする', () => {
		expect(column(plans, 'share_id')?.notNull).toBe(true);
		expect(column(plans, 'data')?.notNull).toBe(true);
	});
});

describe('user', () => {
	it('Better Auth標準のカラムを持つ', () => {
		expect(columnNames(user)).toEqual(
			new Set(['id', 'name', 'email', 'email_verified', 'image', 'created_at', 'updated_at'])
		);
	});

	it('emailを一意かつ必須にする', () => {
		expect(column(user, 'email')?.isUnique).toBe(true);
		expect(column(user, 'email')?.notNull).toBe(true);
	});

	it('アバター表示に使うnameは必須・imageは任意にする（issue #54）', () => {
		expect(column(user, 'name')?.notNull).toBe(true);
		expect(column(user, 'image')?.notNull).toBe(false);
	});

	it('更新時刻を自動更新する', () => {
		const onUpdate = column(user, 'updated_at')?.onUpdateFn;
		expect(onUpdate?.()).toBeInstanceOf(Date);
	});
});

describe('session', () => {
	it('Better Auth標準のカラムを持つ', () => {
		expect(columnNames(session)).toEqual(
			new Set([
				'id',
				'expires_at',
				'token',
				'created_at',
				'updated_at',
				'ip_address',
				'user_agent',
				'user_id'
			])
		);
	});

	it('tokenを一意にする', () => {
		expect(column(session, 'token')?.isUnique).toBe(true);
	});

	it('userIdからuserへ参照を張る', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const [fk] = (session as any)[Symbol.for('drizzle:MySqlInlineForeignKeys')] ?? [];
		expect(fk?.reference().foreignTable).toBe(user);
	});

	it('更新時刻を自動更新する', () => {
		expect(column(session, 'updated_at')?.onUpdateFn?.()).toBeInstanceOf(Date);
	});
});

describe('account', () => {
	it('Better Auth標準のカラムを持つ', () => {
		expect(columnNames(account)).toEqual(
			new Set([
				'id',
				'issuer',
				'account_id',
				'provider_id',
				'user_id',
				'access_token',
				'refresh_token',
				'id_token',
				'access_token_expires_at',
				'refresh_token_expires_at',
				'scope',
				'password',
				'created_at',
				'updated_at'
			])
		);
	});

	// issue #42: Better AuthのCLI generateはこの列を出力しないが、ランタイムは
	// findAccountByKey({ issuer, accountId }) で実際に読み書きする。消すと既存の
	// email/passwordログインごと停止するため、必須列であることを固定する。
	it('issuerを必須の列として持つ', () => {
		expect(column(account, 'issuer')?.notNull).toBe(true);
	});

	it('userIdからuserへ参照を張る', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const [fk] = (account as any)[Symbol.for('drizzle:MySqlInlineForeignKeys')] ?? [];
		expect(fk?.reference().foreignTable).toBe(user);
	});

	it('更新時刻を自動更新する', () => {
		expect(column(account, 'updated_at')?.onUpdateFn?.()).toBeInstanceOf(Date);
	});
});

describe('verification', () => {
	it('Better Auth標準のカラムを持つ', () => {
		expect(columnNames(verification)).toEqual(
			new Set(['id', 'identifier', 'value', 'expires_at', 'created_at', 'updated_at'])
		);
	});

	it('更新時刻を自動更新する', () => {
		expect(column(verification, 'updated_at')?.onUpdateFn?.()).toBeInstanceOf(Date);
	});
});

describe('インデックス', () => {
	/** テーブルに定義された追加インデックスの名前を集合で返す。 */
	function indexNames(table: unknown) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const config = (table as any)[Symbol.for('drizzle:ExtraConfigBuilder')]?.(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(table as any)[Symbol.for('drizzle:MySqlExtraConfigColumns')] ?? {}
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return new Set((config ?? []).map((i: any) => i?.config?.name).filter(Boolean));
	}

	it('sessionにuserIdの索引を張る', () => {
		expect(indexNames(session)).toContain('session_userId_idx');
	});

	// issue #42: (issuer, account_id) の一意制約は、同一プロバイダの同一アカウントが
	// 二重登録されないことを担保する。issuer列とセットで守る。
	it('accountにissuer+accountIdの一意索引とuserIdの索引を張る', () => {
		const names = indexNames(account);
		expect(names).toContain('account_issuer_accountId_uidx');
		expect(names).toContain('account_userId_idx');
	});

	it('verificationにidentifierの索引を張る', () => {
		expect(indexNames(verification)).toContain('verification_identifier_idx');
	});
});

describe('リレーション', () => {
	/** relations()の定義本体をDrizzleのヘルパーで評価する。 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function resolve(rel: any): Record<string, unknown> {
		return rel.config(createTableRelationsHelpers(rel.table));
	}

	it('userは複数のsession・accountを持つ', () => {
		const rels = resolve(userRelations);

		expect(Object.keys(rels).sort()).toEqual(['accounts', 'sessions']);
		expect(rels.sessions).toBeInstanceOf(Many);
		expect((rels.sessions as Many<'session'>).referencedTable).toBe(session);
		expect(rels.accounts).toBeInstanceOf(Many);
		expect((rels.accounts as Many<'account'>).referencedTable).toBe(account);
	});

	it.each([
		['session', sessionRelations],
		['account', accountRelations]
	])('%sは1人のuserに属する', (_label, rel) => {
		const rels = resolve(rel);

		expect(rels.user).toBeInstanceOf(One);
		expect((rels.user as One<'user'>).referencedTable).toBe(user);
	});
});
