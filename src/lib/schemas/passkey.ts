import * as v from 'valibot';

// issue #189: パスキーの remote function の入力（contracts/auth.md）。
// credential の中身（WebAuthn の JSON）の検査は Supabase Auth が行うので、ここではオブジェクトであることだけを確かめる。
const challengeId = v.pipe(v.string(), v.minLength(1));

const credential = v.pipe(
	v.unknown(),
	// 配列・null・文字列などを外し、プレーンなオブジェクトだけを通す
	v.check((value): value is Record<string, unknown> => {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	})
);

export const verifyPasskeySchema = v.object({ challengeId, credential });

export type VerifyPasskeyInput = v.InferOutput<typeof verifyPasskeySchema>;
