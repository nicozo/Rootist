import { describe, expect, it } from 'vite-plus/test';

// issue #199: /register は /login へ移す（FR-009）。form action は無い（FR-011）。

const registerServer = await import('./+server');

describe('/register', () => {
	it('FR-009: GET は /login へ 308 で移す', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { GET } = registerServer as any;

		await expect(Promise.resolve().then(() => GET({}))).rejects.toMatchObject({
			status: 308,
			location: '/login'
		});
	});

	it('FR-011: POST は export しない（405 になる）', () => {
		expect('POST' in registerServer).toBe(false);
	});
});
