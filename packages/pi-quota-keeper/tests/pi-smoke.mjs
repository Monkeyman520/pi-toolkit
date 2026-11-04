import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "pi-quota-smoke-"));
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const identity = "fixture@example.test";
const id =
	"anthropic:" +
	createHash("sha256").update(identity).digest("hex").slice(0, 16);

const accountId = (provider, email) =>
	`${provider}:${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;
const agA = accountId("antigravity", "fixture-ag-a@example.test");
const agB = accountId("antigravity", "fixture-ag-b@example.test");
const codexId = accountId("openai-codex", "fixture-codex@example.test");
let key = 0;
try {
	const isolated = join(root, "plugin");
	await cp(packageRoot, isolated, {
		recursive: true,
		filter: (p) => !p.includes("node_modules") && !p.includes("tests"),
	});

	const npmCli =
		process.env.npm_execpath ??
		join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
	const installed = spawnSync(
		process.execPath,
		[
			npmCli,
			"ci",
			"--omit=dev",
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--offline",
			"--no-audit",
		],
		{
			cwd: isolated,
			encoding: "utf8",
			windowsHide: true,
			env: {
				...process.env,
				NODE_OPTIONS: "--max-old-space-size=256 --max-semi-space-size=4",
			},
		},
	);
	assert.equal(
		installed.status,
		0,
		"isolated production dependency installation must succeed from the lockfile/cache",
	);
	const reset = Date.now() + 10000;
	await writeFile(
		join(root, "auth.json"),
		JSON.stringify({
			anthropic: {
				type: "oauth",
				email: identity,
				access: "fixture-access",
				refresh: "fixture-refresh",
				expires: Date.now() + 3600000,
			},

			"openai-codex": {
				type: "oauth",
				email: "fixture-codex@example.test",
				access: "fixture-codex-access",
				refresh: "fixture-codex-refresh",
				accountId: "fixture-codex-account",
				expires: Date.now() + 3600000,
			},
		}),
	);

	await writeFile(
		join(root, "antigravity-accounts.json"),
		JSON.stringify({
			version: 1,
			activeAccountId: "a",
			accounts: {
				a: {
					email: "fixture-ag-a@example.test",
					access: "fixture-ag-a",
					refresh: "fixture-ag-a-refresh",
					projectId: "project-a",
					expires: Date.now() + 3600000,
				},
				b: {
					email: "fixture-ag-b@example.test",
					access: "fixture-ag-b",
					refresh: "fixture-ag-b-refresh",
					projectId: "project-b",
					expires: 0,
				},
			},
		}),
	);
	await writeFile(
		join(root, "pi-quota-keeper.json"),
		JSON.stringify({
			pollIntervalMs: 10000,
			delayMs: 30,
			enabledAccounts: [id, agA, agB, codexId],
			models: {
				[id]: "quota-test",
				[agA]: "gemini-fixture",
				[agB]: "gemini-fixture",
				[codexId]: "codex-fixture",
			},
		}),
	);
	await writeFile(
		join(root, "fixture.ts"),
		`
 import {createAssistantMessageEventStream} from "@earendil-works/pi-ai";
 import {appendFileSync,readFileSync,writeFileSync,existsSync} from "node:fs";
 const record=(type,extra={})=>appendFileSync(process.env.SMOKE_METRICS,JSON.stringify({type,pid:process.pid,at:Date.now(),...extra})+"\\n");

 function assertAntigravityRequest(init){
  const h=new Headers(init.headers);
  if(!h.get("user-agent")?.startsWith("antigravity/")||!h.get("user-agent")?.includes("pi-quota-keeper/")||h.get("accept-encoding")!=="gzip"||init.redirect!=="error")
   throw Error("Antigravity protocol headers/redirect policy missing");
 }

 const hasWake=(provider,project)=>existsSync(process.env.SMOKE_METRICS)&&readFileSync(process.env.SMOKE_METRICS,"utf8").split("\\n").filter(Boolean).some(l=>{const e=JSON.parse(l);return e.type==="wake"&&e.provider===provider&&(!project||e.project===project);});
 const reply=model=>{
  const stream=createAssistantMessageEventStream();
  const message={role:"assistant",api:model.api,provider:model.provider,model:model.id,content:[{type:"text",text:"OK"}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:Date.now()};
  queueMicrotask(()=>{stream.push({type:"done",reason:"stop",message});stream.end(message);});return stream;
 };
 export default function(pi){
  globalThis.fetch=async(url,init)=>{
   const u=new URL(url);
   if(["daily-cloudcode-pa.googleapis.com","daily-cloudcode-pa.sandbox.googleapis.com","cloudcode-pa.googleapis.com"].includes(u.hostname)){
    assertAntigravityRequest(init);
    const project=JSON.parse(init.body).project;

    if(u.pathname==="/v1internal:generateContent"){
     const body=JSON.parse(init.body), token=new Headers(init.headers).get("authorization");
     if(token!=="Bearer fixture-ag-"+(project==="project-a"?"a":"b-refreshed")||body.model!=="gemini-fixture"||body.request.contents[0].parts[0].text!=="Reply OK."||body.request.generationConfig.maxOutputTokens!==1||body.request.tools)throw Error("Google account pin or minimal payload failed");
     record("wake",{provider:"antigravity",project,model:body.model});
     if(project==="project-b")return new Response("Quota reached",{status:429});
     return Response.json({response:{candidates:[{finishReason:"STOP",content:{parts:[{text:"OK"}]}}]}});
    }
    record("antigravity",{path:u.pathname,host:u.hostname,project});
    const summary=u.pathname==="/v1internal:retrieveUserQuotaSummary";
    if(project==="project-a"&&summary&&u.hostname==="daily-cloudcode-pa.sandbox.googleapis.com")
     return Response.json({groups:[{displayName:"Gemini",buckets:[
      {bucketId:"gemini-5h",window:"5h",remainingFraction:0.8,resetTime:new Date(Number(process.env.SMOKE_RESET)+(hasWake("antigravity","project-a")?18000000:0)).toISOString()},
      {bucketId:"gemini-weekly",window:"weekly",remainingFraction:0.4,resetTime:"2030-01-07T00:00:00Z"}
     ]}]});
    if(project==="project-b"&&u.pathname==="/v1internal:fetchAvailableModels")
     return Response.json({models:{"gemini-fixture":{dailyQuotaInfo:{remainingFraction:0.6,resetTime:new Date(Number(process.env.SMOKE_RESET)).toISOString()},weeklyQuotaInfo:{remainingFraction:0.2}}}});
    return new Response("",{status:project==="project-a"?429:403});
   }

   if(["https://chatgpt.com/backend-api/wham/usage","https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"].includes(String(url))){
    const h=new Headers(init.headers);
    if(h.get("authorization")!=="Bearer fixture-codex-access"||h.get("chatgpt-account-id")!=="fixture-codex-account")throw Error("Codex quota account pin failed");

    if(u.pathname.endsWith("/rate-limit-reset-credits")){
     if(init.method!=="GET"||init.redirect!=="error"||init.body)throw Error("Reset credits must be read-only");
     record("codex-reset-details");
     return Response.json({available_count:3,credits:[
      {id:"private-reset-one",status:"available",expires_at:"2031-05-01T00:00:00Z"},
      {id:"private-reset-two",status:"available",expires_at:"2031-05-01T00:00:00Z"},
      {id:"private-reset-three",status:"available",expires_at:"2031-06-01T00:00:00Z"}
     ]});
    }
    record("codex-quota");
    return Response.json({rate_limit_reset_credits:{available_count:3},rate_limit:{primary_window:{used_percent:10,reset_at:Number(process.env.SMOKE_RESET)+(hasWake("openai-codex")?18000000:0)}}});
   }
   if(String(url)!=="https://api.anthropic.com/api/oauth/usage")throw Error("Unexpected external request blocked by fixture");
   record("quota");
   await new Promise(resolve=>setTimeout(resolve,300));
   const activated=existsSync(process.env.SMOKE_METRICS)&&readFileSync(process.env.SMOKE_METRICS,"utf8").includes('"type":"activation"');
   return new Response(JSON.stringify({five_hour:{utilization:activated?1:0,resets_at:new Date(Number(process.env.SMOKE_RESET)+(activated?18000000:0)).toISOString()}}));
  };
  pi.registerProvider("anthropic",{baseUrl:"https://example.invalid",api:"quota-test-api",
   oauth:{name:"Fixture OAuth",isSubscription:true,login:async()=>{throw Error("No real login");},refreshToken:async(c)=>c,getApiKey:c=>c.access},
   models:[{id:"quota-test",name:"Fixture",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:100000,maxTokens:100}],
   streamSimple(model,context){
    const stream=createAssistantMessageEventStream();
    const activation=JSON.stringify(context).includes("Reply OK.");
    record(activation?"activation":"work");
    const message={role:"assistant",api:model.api,provider:model.provider,model:model.id,content:[{type:"text",text:"OK"}],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:Date.now()};
    queueMicrotask(()=>{stream.push({type:"done",reason:"stop",message});stream.end(message);});return stream;
   }
  });

  const oauth={name:"Fixture",isSubscription:true,login:async()=>{throw Error("No login");},refreshToken:async c=>c,getApiKey:c=>c.access};
  const chat=(id)=>[{id,name:id,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000,maxTokens:100}];

  const googleOAuth={...oauth,refreshToken:async c=>{
   if(!["fixture-ag-b-refresh","fixture-ag-b-rotated"].includes(c.refresh)||c.projectId!=="project-b")throw Error("Incorrect linked renewal target");
   record("auth-refresh",{project:c.projectId});
   const next={...c,access:"fixture-ag-b-refreshed",refresh:c.refresh==="fixture-ag-b-refresh"?"fixture-ag-b-rotated":"fixture-ag-b-rotated-2",expires:Date.now()+3600000};
   const file=process.env.PI_CODING_AGENT_DIR+"/antigravity-accounts.json";
   const store=JSON.parse(readFileSync(file,"utf8"));store.accounts.b=next;writeFileSync(file,JSON.stringify(store));
   return next;
  }};
  pi.registerProvider("antigravity",{baseUrl:"https://example.invalid",api:"quota-test-api",oauth:googleOAuth,models:chat("gemini-fixture"),streamSimple(){throw Error("Rotating Google provider must not be called");}});
  pi.registerProvider("openai-codex",{baseUrl:"https://example.invalid",api:"quota-test-api",oauth,models:chat("codex-fixture"),streamSimple(model,context,options){
   if(options.apiKey!=="fixture-codex-access"||options.headers["ChatGPT-Account-Id"]!=="fixture-codex-account"||options.maxRetries!==0||options.maxTokens!==1||context.messages.length!==1)throw Error("Codex model account pin failed");
   record("wake",{provider:"openai-codex"});return reply(model);
  }});
 }
 `,
	);
	const start = () => {
		const events = [];
		let stdout = "",
			stderr = "";
		const child = spawn(
			process.env.PI_BINARY ?? "pi",
			[
				"--mode",
				"rpc",
				"--no-session",
				"--no-extensions",
				"--no-mcp",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				"--no-context-files",
				"--offline",
				"-e",
				isolated,
				"-e",
				join(root, "fixture.ts"),
			],
			{
				cwd: root,
				env: {
					...process.env,
					PI_CODING_AGENT_DIR: root,
					PI_OFFLINE: "1",
					SMOKE_METRICS: join(root, "metrics.jsonl"),
					SMOKE_RESET: String(reset),
				},
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		const until = async (predicate) => {
			const deadline = Date.now() + 20000;
			while (!predicate()) {
				if (Date.now() > deadline)
					throw Error(`Pi quota smoke timeout: ${stderr.slice(-2000)}`);
				await pause(25);
			}
		};
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			for (;;) {
				const n = stdout.indexOf("\n");
				if (n < 0) break;
				const line = stdout.slice(0, n);
				stdout = stdout.slice(n + 1);
				try {
					events.push(JSON.parse(line));
				} catch {}
			}
		});
		child.stderr.on("data", (c) => {
			stderr += c;
		});
		child.on("error", (e) => {
			stderr += e.message;
		});
		const command = async (type, data = {}) => {
			const id = String(++key);
			child.stdin.write(`${JSON.stringify({ id, type, ...data })}\n`);
			await until(() =>
				events.some((e) => e.id === id && e.type === "response"),
			);
			const response = events.find((e) => e.id === id && e.type === "response");
			assert.equal(response.success, true, JSON.stringify(response));
			return response.data;
		};
		const client = { child, events, until, command };
		children.push(client);
		return client;
	};
	const metrics = async () => {
		try {
			return (await readFile(join(root, "metrics.jsonl"), "utf8"))
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l));
		} catch {
			return [];
		}
	};
	const wait = async (predicate) => {
		const deadline = Date.now() + 20000;
		while (!(await predicate())) {
			if (Date.now() > deadline)
				throw Error("Quota side-effect evidence timeout");
			await pause(50);
		}
	};
	const originalAuth = await readFile(join(root, "auth.json"), "utf8");
	const originalLinked = await readFile(
		join(root, "antigravity-accounts.json"),
		"utf8",
	);
	// Pi 1.5.0 can race on Windows trust-store initialization; ownership races
	// are covered separately while the two fully initialized processes run together.
	const a = start();
	await a.command("get_commands");
	const b = start();
	await b.command("get_commands");
	await a.command("set_model", {
		provider: "anthropic",
		modelId: "quota-test",
	});
	await a.command("prompt", { message: "foreground work" });
	await a.until(() => a.events.some((e) => e.type === "agent_settled"));
	const before = await a.command("get_messages");
	await wait(async () =>
		(await metrics()).some((e) => e.type === "activation"),
	);
	await wait(
		async () => (await metrics()).filter((e) => e.type === "wake").length === 3,
	);
	let m = await metrics();
	assert.equal(
		m.filter((e) => e.type === "activation").length,
		1,
		"one activation across two Pi processes",
	);
	assert.ok(
		m.find((e) => e.type === "activation").at >= reset + 30,
		"post-reset delay respected",
	);
	const after = await a.command("get_messages");
	assert.deepEqual(
		after,
		before,
		"isolated activation does not mutate work transcript",
	);
	await Promise.all([
		a.command("prompt", { message: "/quota" }),
		b.command("prompt", { message: "/quota" }),
	]);
	assert.ok(
		a.events.some(
			(e) =>
				e.type === "extension_ui_request" &&
				String(e.message).includes("reset +30ms"),
		),
		"each view displays the real schedule",
	);
	assert.ok(
		b.events.some(
			(e) =>
				e.type === "extension_ui_request" &&
				String(e.message).includes("reset +30ms"),
		),
		"follower displays the owner schedule rather than local defaults",
	);
	assert.equal(
		new Set(m.filter((e) => e.type === "quota").map((e) => e.pid)).size,
		1,
		"only one external poller",
	);
	const compact = a.events
		.filter((e) => e.type === "extension_ui_request")
		.at(-1)?.message;
	assert.ok(
		String(compact).includes("4 available"),
		"compact view summarizes quota health",
	);
	assert.ok(!String(compact).includes(id), "compact view hides machine IDs");
	await a.command("prompt", { message: "/quota details" });
	const details = a.events
		.filter((e) => e.type === "extension_ui_request")
		.at(-1)?.message;
	assert.ok(String(details).includes(id), "details preserve configuration IDs");
	assert.ok(
		String(details).includes(new Date(reset + 18000000).toISOString()) ||
			String(details).includes(new Date(reset).toISOString()),
		"details preserve exact UTC resets",
	);

	// Service dispatch is observable before the provider's completion is persisted.
	// Wait for the durable result, not merely the fixture's request counter.
	await wait(async () => {
		const current = JSON.parse(
			await readFile(join(root, "pi-quota-keeper-state.json"), "utf8"),
		);
		return (
			current.ledger[agA]?.outcome?.includes("completed") &&
			current.ledger[agB]?.outcome?.includes("HTTP 429") &&
			current.ledger[codexId]?.outcome?.includes("completed")
		);
	});
	const cached = JSON.parse(
		await readFile(join(root, "pi-quota-keeper-state.json"), "utf8"),
	);
	const ag = cached.snapshots.filter((s) => s.provider === "antigravity");
	assert.equal(ag.length, 2, "both linked Pi accounts are queried");
	assert.ok(
		ag.every(
			(s) =>
				s.status === "available" &&
				s.activation.supported &&
				s.activation.bestEffort,
		),
		"Antigravity quota and explicitly opted-in best-effort wake-up are available",
	);
	assert.deepEqual(
		ag[0].windows.map((w) => w.remainingPercent),
		[80, 40],
		"429 primary summary falls back to alternate summary",
	);
	assert.deepEqual(
		ag[1].windows.map((w) => w.remainingPercent),
		[60, 20],
		"403 summaries fall back to daily and weekly model quota",
	);
	assert.ok(
		String(details).includes("gemini-weekly") &&
			String(details).includes("gemini-fixture:daily"),
		"RPC quota details render both quota response formats",
	);
	const agMetrics = (await metrics()).filter((e) => e.type === "antigravity");
	assert.ok(
		agMetrics.length > 0 &&
			agMetrics.every((e) => e.pid === m.find((e) => e.type === "quota").pid),
		"only the owner queries Antigravity accounts",
	);

	assert.equal(
		await readFile(join(root, "auth.json"), "utf8"),
		originalAuth,
		"wake-up does not change the active login",
	);

	const linkedAfter = JSON.parse(
		await readFile(join(root, "antigravity-accounts.json"), "utf8"),
	);
	const linkedBefore = JSON.parse(originalLinked);
	assert.equal(
		linkedAfter.activeAccountId,
		linkedBefore.activeAccountId,
		"linked renewal never switches the selected account",
	);
	assert.deepEqual(
		linkedAfter.accounts.a,
		linkedBefore.accounts.a,
		"unrelated linked account remains untouched",
	);
	assert.equal(
		linkedAfter.accounts.b.access,
		"fixture-ag-b-refreshed",
		"expired linked token was renewed and saved by its provider",
	);
	assert.equal(
		(await metrics()).filter((e) => e.type === "auth-refresh").length,
		1,
		"one owner renews each expired linked token once",
	);
	assert.ok(
		cached.ledger[agA].outcome.includes("completed") &&
			cached.ledger[agA].outcome.includes("unverified"),
		"successful Google request never claims confirmed window activation",
	);
	assert.ok(
		cached.ledger[agB].outcome.includes("HTTP 429"),
		"Google rejection is recorded without rotating accounts",
	);
	assert.ok(
		cached.ledger[codexId].outcome.includes("completed"),
		"Codex wake-up completes with pinned auth",
	);
	assert.ok(
		(await metrics())
			.filter((e) => e.type === "wake")
			.every((e) => e.at >= reset + 30),
		"all providers respect reset delay",
	);

	assert.ok(
		String(compact).includes("Rate-limit resets: 3 available"),
		"compact RPC view displays available Codex reset credits",
	);
	assert.ok(
		String(details).includes("Rate-limit resets: 3 available"),
		"detailed RPC view displays reset count",
	);
	assert.deepEqual(
		cached.snapshots.find((s) => s.provider === "openai-codex").resetCredits,
		{
			availableCount: 3,
			expirations: [
				{ expiresAt: Date.parse("2031-05-01T00:00:00Z") },
				{ expiresAt: Date.parse("2031-05-01T00:00:00Z") },
				{ expiresAt: Date.parse("2031-06-01T00:00:00Z") },
			],
		},
		"owner publishes a credential-free reset count to followers without redeeming it",
	);

	assert.ok(
		!String(compact).includes("2031-05-01"),
		"compact view hides reset-credit expiry dates",
	);
	assert.ok(
		String(details).includes("2 resets expire 2031-05-01T00:00:00.000Z"),
		"details group credits sharing an expiry",
	);
	assert.ok(
		String(details).includes("1 reset expires 2031-06-01T00:00:00.000Z"),
		"details preserve different expiry dates",
	);
	assert.ok(
		!JSON.stringify(cached).includes("private-reset"),
		"cached expiry metadata excludes redemption IDs",
	);
	assert.ok(
		(await metrics())
			.filter((e) => e.type === "codex-reset-details")
			.every((e) => e.pid === m.find((e) => e.type === "quota").pid),
		"only the owner fetches expiry details",
	);
	const leaderPid = m.find((e) => e.type === "quota").pid;
	const leader = children.find((c) => c.child.pid === leaderPid);
	assert.ok(leader, "identified owner");

	const manualFollower = children.find((c) => c !== leader);
	const latestUi = (client) =>
		String(
			client.events
				.filter(
					(e) => e.type === "extension_ui_request" && e.method === "notify",
				)
				.at(-1)?.message ?? "",
		);
	const pollsBefore = (await metrics()).filter(
		(e) => e.type === "quota",
	).length;
	linkedAfter.accounts.b.expires = 0;
	await writeFile(
		join(root, "antigravity-accounts.json"),
		JSON.stringify(linkedAfter),
	);
	await manualFollower.command("prompt", { message: "/quota refresh" });
	assert.ok(
		latestUi(manualFollower).startsWith("Quota refreshed."),
		`follower waits for completed owner refresh; actual=${latestUi(manualFollower)}`,
	);
	assert.equal(
		(await metrics()).filter((e) => e.type === "auth-refresh").length,
		2,
		"repeated linked token renewal in the same Pi process succeeds without jiti Proxy fs crash",
	);
	assert.ok(
		(await metrics()).filter((e) => e.type === "quota").length > pollsBefore,
		"refresh bypasses the poll interval",
	);
	assert.ok(
		(await metrics())
			.filter((e) => e.type === "quota")
			.every((e) => e.pid === leaderPid),
		"manual refresh never creates a second poller",
	);
	const pollsAfterRefresh = (await metrics()).filter(
		(e) => e.type === "quota",
	).length;
	await manualFollower.command("prompt", { message: "/quota list" });
	const list = latestUi(manualFollower);
	assert.ok(
		[id, agA, agB, codexId].every((value) => list.includes(value)),
		"list displays exact account IDs",
	);
	assert.ok(
		list.includes("Account") &&
			list.includes("Type") &&
			list.includes("OAuth") &&
			list.includes("f***@e***"),
		"list includes masked account and type",
	);
	assert.ok(
		!list.includes(identity) && !list.includes("fixture-codex@example.test"),
		"list never prints full account email",
	);
	await manualFollower.command("prompt", {
		message: `/quota ${codexId} details`,
	});
	assert.ok(
		latestUi(manualFollower).includes(codexId) &&
			latestUi(manualFollower).includes("2031-05-01"),
		"ID-specific details retain Codex reset expiries",
	);
	assert.ok(
		!latestUi(manualFollower).includes("Google Antigravity"),
		"ID lookup omits all unrelated accounts",
	);
	await manualFollower.command("prompt", { message: `/quota ${agA}` });
	assert.ok(
		latestUi(manualFollower).includes("80%") &&
			!latestUi(manualFollower).includes("OpenAI Codex"),
		"compact lookup selects exactly one ID",
	);
	await manualFollower.command("prompt", { message: "/quota missing" });
	assert.ok(
		latestUi(manualFollower).includes("Account ID not found"),
		"unknown IDs never fall back to every account",
	);
	assert.equal(
		(await metrics()).filter((e) => e.type === "quota").length,
		pollsAfterRefresh,
		"list and ID views only read cached results",
	);
	const beforeCoalesced = (await metrics()).filter(
		(e) => e.type === "quota",
	).length;
	await Promise.all([
		a.command("prompt", { message: "/quota refresh" }),
		b.command("prompt", { message: "/quota refresh" }),
	]);
	assert.ok(
		latestUi(a).startsWith("Quota refreshed.") &&
			latestUi(b).startsWith("Quota refreshed."),
		"concurrent callers both receive completion",
	);
	assert.equal(
		(await metrics()).filter((e) => e.type === "quota").length,
		beforeCoalesced + 1,
		"concurrent refresh commands coalesce into one owner poll",
	);
	assert.equal(
		(await metrics()).filter((e) => e.type === "wake").length,
		3,
		"manual quota refresh does not replay wake-ups",
	);
	m = await metrics();
	const refreshToken = await readFile(
		join(root, ".pi-quota-keeper-refresh-token"),
		"utf8",
	);
	assert.ok(
		!JSON.stringify(cached).includes(refreshToken),
		"local refresh authorization never enters quota snapshots",
	);
	leader.child.kill("SIGKILL");
	const follower = children.find((c) => c !== leader);
	await wait(async () =>
		(await metrics()).some(
			(e) => e.type === "quota" && e.pid === follower.child.pid,
		),
	);
	await pause(1500);
	m = await metrics();
	assert.equal(
		m.filter((e) => e.type === "activation").length,
		1,
		"owner crash does not replay activation",
	);
	assert.equal(
		m.filter((e) => e.type === "wake").length,
		3,
		"owner takeover does not replay successful or failed wake-ups",
	);
	const state = await readFile(
		join(root, "pi-quota-keeper-state.json"),
		"utf8",
	);
	assert.ok(
		!state.includes("fixture-access") &&
			!state.includes("fixture-refresh") &&
			!state.includes("fixture-ag") &&
			!state.includes("fixture-codex") &&
			!state.includes(identity),
		"shared state contains no credentials or full email",
	);
	follower.child.stdin.end();
	await Promise.race([
		new Promise((r) => follower.child.once("exit", r)),
		pause(5000).then(() => {
			throw Error("Pi shutdown timeout");
		}),
	]);
	await assert.rejects(
		readFile(join(root, ".pi-quota-keeper-refresh-token")),
		{ code: "ENOENT" },
		"orderly owner shutdown removes its authorization token",
	);
	console.log(
		"Pi standalone smoke: quota ID/list/owner-forwarded refresh, Antigravity renewal and 429/403 fallback, one poller, reset delay, isolated Google/Codex wake-ups and Claude activation, abrupt owner death/takeover, no replay, secret-free cache PASS",
	);
} finally {
	for (const c of children)
		if (c.child.exitCode === null) c.child.kill("SIGKILL");
	await pause(200);
	await rm(root, { recursive: true, force: true });
}
