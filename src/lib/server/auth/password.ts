// パスワードハッシュ化（argon2id）とタイミング攻撃緩和用のダミー検証。

import { hash, verify } from '@node-rs/argon2';

// OWASP/Lucia推奨値。ハッシュ文字列にパラメータが自己記述されるため、
// verify() 側はこのオプションを渡さなくても将来のパラメータ変更に追従できる。
const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1,
	outputLen: 32
};

export async function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password);
}

// タイミング攻撃緩和（不変条件4: アカウント列挙の抑制）用のダミーハッシュ。
// ログイン時にメールアドレスが存在しない場合でもこのハッシュに対してverify()を実行することで、
// 「存在するメールで実パスワード検証にかかる時間」と「存在しないメールの応答時間」の差を縮める。
// モジュール初期化時に一度だけ生成し使い回す（起動コストは1回のみ）。
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
	if (!dummyHashPromise) {
		dummyHashPromise = hash('dummy-password-for-timing-mitigation', ARGON2_OPTIONS);
	}
	return dummyHashPromise;
}

/**
 * メール不存在時に呼び出す。実際のverify()相当のコストを払うだけで、結果は常に使わない
 * （呼び出し元は常にログイン失敗として扱う）。
 */
export async function verifyAgainstDummyHash(password: string): Promise<void> {
	const dummyHash = await getDummyHash();
	await verify(dummyHash, password).catch(() => false);
}
