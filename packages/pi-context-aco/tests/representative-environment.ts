import { mkdirSync } from "node:fs";
import { join } from "node:path";

const inherited = new Set([
	"PATH",
	"PATHEXT",
	"SYSTEMROOT",
	"WINDIR",
	"COMSPEC",
	"SYSTEMDRIVE",
	"OS",
	"PROCESSOR_ARCHITECTURE",
	"NUMBER_OF_PROCESSORS",
	"LANG",
	"LC_ALL",
	"TERM",
]);
/** Opt-in test-process routing, never a host/global proxy setting or an auth carrier. */
export function testProxyEnvironment(
	proxy: string | undefined,
): NodeJS.ProcessEnv {
	if (!proxy) return {};
	if (proxy !== "http://127.0.0.1:7890")
		throw Error("Only the explicitly approved local test proxy is supported");
	return {
		ACO_TEST_PROXY: proxy,
		HTTP_PROXY: proxy,
		HTTPS_PROXY: proxy,
		ALL_PROXY: proxy,
		http_proxy: proxy,
		https_proxy: proxy,
		all_proxy: proxy,
		NO_PROXY: "localhost,127.0.0.1,::1",
		no_proxy: "localhost,127.0.0.1,::1",
		NODE_USE_ENV_PROXY: "1",
	};
}
/** An empty test identity, not inference auth. This does not provide an OS sandbox. */
export function verificationEnvironment(
	source: NodeJS.ProcessEnv,
	profile: string,
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {};
	for (const [key, value] of Object.entries(source))
		if (inherited.has(key.toUpperCase()) && value !== undefined)
			env[key.toUpperCase()] = value;
	return {
		...env,
		...testProxyEnvironment(source.ACO_TEST_PROXY),
		HOME: join(profile, "home"),
		USERPROFILE: join(profile, "home"),
		APPDATA: join(profile, "home", "AppData", "Roaming"),
		LOCALAPPDATA: join(profile, "home", "AppData", "Local"),
		TEMP: join(profile, "tmp"),
		TMP: join(profile, "tmp"),
		PI_CODING_AGENT_DIR: join(profile, "agent"),
		PI_OFFLINE: "1",
		NPM_CONFIG_OFFLINE: "true",
		NPM_CONFIG_CACHE: join(profile, "npm-cache"),
		CI: "1",
	};
}
export function prepareVerificationProfile(profile: string) {
	for (const name of [
		"home",
		"home/AppData/Roaming",
		"home/AppData/Local",
		"tmp",
		"agent",
		"npm-cache",
	])
		mkdirSync(join(profile, name), { recursive: true });
}
