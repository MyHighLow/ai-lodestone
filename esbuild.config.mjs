import esbuild from "esbuild";
import builtins from "builtin-modules";
import { copyToVault, readSavedVault } from "./scripts/install.mjs";

const prod = process.argv[2] === "production";

/** In dev mode, copy the build into the remembered vault after every rebuild. */
const copyPlugin = {
	name: "copy-to-vault",
	setup(build) {
		build.onEnd((result) => {
			if (prod || result.errors.length) return;
			const vault = readSavedVault();
			if (!vault) {
				console.log("[lodestone] built (no vault remembered; run `npm run install-plugin -- <vault>` once)");
				return;
			}
			copyToVault(vault, { hotReload: true });
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
	format: "cjs",
	target: "es2020",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	plugins: [copyPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
