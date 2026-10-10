import { App, PluginSettingTab, Setting } from "obsidian";
import type LodestonePlugin from "./main";
import { resolvePowershellExe } from "./launcher";
import type { Env } from "./types";

export class LodestoneSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: LodestonePlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		const save = async (resetLookup = false) => {
			await this.plugin.save();
			if (resetLookup) this.plugin.sessions.reset();
		};

		new Setting(containerEl)
			.setName("Default terminal")
			.setDesc("Used by the header button and prompt blocks. Right-clicking either one also changes this.")
			.addDropdown((d) =>
				d
					.addOptions({ powershell: "PowerShell", wsl: "WSL" })
					.setValue(s.defaultEnv)
					.onChange((v) => void this.plugin.setDefaultEnv(v as Env)),
			);

		new Setting(containerEl)
			.setName("New-session prompt")
			.setDesc("Sent by the header button. {{file}} = note file name, {{path}} = full path, {{vaultPath}} = path inside the vault. Prompt blocks can use these too.")
			.addTextArea((t) => {
				t.setValue(s.notePromptTemplate).onChange(async (v) => {
					s.notePromptTemplate = v;
					await save();
				});
				t.inputEl.rows = 4;
				t.inputEl.addClass("lodestone-setting-wide");
			});

		new Setting(containerEl)
			.setName("Name sessions")
			.setDesc("Pass the note or prompt-block title as `claude --name`, so it shows up in /resume.")
			.addToggle((t) =>
				t.setValue(s.nameSessions).onChange(async (v) => {
					s.nameSessions = v;
					await save();
				}),
			);

		new Setting(containerEl).setName("PowerShell").setHeading();

		new Setting(containerEl)
			.setName("PowerShell executable")
			.setDesc(`"auto" uses PowerShell 7 if installed, else Windows PowerShell. Currently: ${resolvePowershellExe(s.powershellExe)}`)
			.addText((t) =>
				t.setValue(s.powershellExe).onChange(async (v) => {
					s.powershellExe = v.trim() || "auto";
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Claude command (PowerShell)")
			.setDesc("Command name or full path to claude.exe.")
			.addText((t) =>
				t.setValue(s.claudeCommandPowershell).onChange(async (v) => {
					s.claudeCommandPowershell = v.trim() || "claude";
					await save();
				}),
			);

		new Setting(containerEl)
			.setName("Windows sessions folder")
			.setDesc("Where Windows claude keeps transcripts. Leave empty for %USERPROFILE%\\.claude\\projects.")
			.addText((t) =>
				t
					.setPlaceholder(this.plugin.sessions.windowsProjectsDir())
					.setValue(s.windowsProjectsDir)
					.onChange(async (v) => {
						s.windowsProjectsDir = v.trim();
						await save(true);
					}),
			);

		new Setting(containerEl).setName("WSL").setHeading();

		new Setting(containerEl)
			.setName("WSL distro")
			.setDesc("Leave empty for your default distro (see `wsl -l`).")
			.addText((t) =>
				t.setPlaceholder("Ubuntu").setValue(s.wslDistro).onChange(async (v) => {
					s.wslDistro = v.trim();
					await save(true);
				}),
			);

		new Setting(containerEl)
			.setName("Claude command (WSL)")
			.setDesc("Runs in a login shell, so anything on your PATH (nvm, ~/.local/bin) works.")
			.addText((t) =>
				t.setValue(s.claudeCommandWsl).onChange(async (v) => {
					s.claudeCommandWsl = v.trim() || "claude";
					await save();
				}),
			);

		const wslDir = new Setting(containerEl)
			.setName("WSL sessions folder")
			.setDesc("Where WSL claude keeps transcripts, as a Windows path. Leave empty to auto-detect.")
			.addText((t) =>
				t.setPlaceholder("\\\\wsl.localhost\\Ubuntu\\home\\you\\.claude\\projects").setValue(s.wslProjectsDir).onChange(async (v) => {
					s.wslProjectsDir = v.trim();
					await save(true);
				}),
			);
		if (!s.wslProjectsDir) {
			void this.plugin.sessions.wslProjectsDir().then((dir) => {
				wslDir.setDesc(`Where WSL claude keeps transcripts, as a Windows path. Leave empty to auto-detect. Detected: ${dir ?? "nothing (is WSL running?)"}`);
			});
		}

		new Setting(containerEl)
			.setName("Windows drive mount root")
			.setDesc("Where Windows drives appear inside WSL. D:\\Notes becomes <root>/d/Notes.")
			.addText((t) =>
				t.setValue(s.wslMountRoot).onChange(async (v) => {
					s.wslMountRoot = v.trim() || "/mnt";
					await save();
				}),
			);

		new Setting(containerEl).setName("History").setHeading();

		new Setting(containerEl)
			.setName("Sessions to remember")
			.setDesc(`Shown by "Browse recent sessions". Currently ${this.plugin.history.length} saved.`)
			.addText((t) =>
				t.setValue(String(s.historyLimit)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (n > 0) {
						s.historyLimit = n;
						await save();
					}
				}),
			)
			.addButton((b) =>
				b.setButtonText("Clear").setWarning().onClick(async () => {
					this.plugin.history = [];
					await save();
					this.display();
				}),
			);
	}
}
