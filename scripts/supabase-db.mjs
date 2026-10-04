// issue #128: `pnpm db:new` / `db:migrate` / `db:status` の入口。判定ロジックは
// src/lib/dev-tools/supabase-db.ts（単体テスト済み）にあり、ここは副作用（子プロセス・入出力）だけを持つ。
// 子プロセスは shell を介さず、引数を配列で渡す。接続文字列はログに出さない。
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { SUPABASE_CLI, main } from '../src/lib/dev-tools/supabase-db.ts';

const repoRoot = new URL('../', import.meta.url);

function readDotenv() {
	try {
		return readFileSync(new URL('.env', repoRoot), 'utf8');
	} catch {
		return null;
	}
}

function runCli(args, { stdin, capture }) {
	return new Promise((resolve) => {
		const child = spawn('pnpm', ['dlx', SUPABASE_CLI, ...args], {
			cwd: repoRoot,
			stdio: [stdin, capture ? 'pipe' : 'inherit', 'inherit']
		});
		let stdout = '';
		if (capture) {
			child.stdout.on('data', (chunk) => {
				stdout += chunk;
				process.stdout.write(chunk);
			});
		}
		child.on('error', (e) => {
			console.error(`CLI を起動できませんでした: ${e.message}`);
			resolve({ code: 127, stdout });
		});
		child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
	});
}

function ask(prompt) {
	return new Promise((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		let answered = false;
		rl.question(prompt, (answer) => {
			answered = true;
			rl.close();
			resolve(answer);
		});
		rl.on('close', () => {
			if (!answered) resolve(null);
		});
	});
}

const code = await main(process.argv.slice(2), {
	processEnv: process.env,
	readDotenv,
	stdinIsTTY: process.stdin.isTTY,
	stdoutIsTTY: process.stdout.isTTY,
	runCli,
	ask,
	log: (m) => console.log(m),
	error: (m) => console.error(m)
});
process.exit(code);
