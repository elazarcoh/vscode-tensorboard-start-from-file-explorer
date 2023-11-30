import * as vscode from 'vscode';

interface Config extends TensorboardArgs {
}

interface TensorboardArgs {
	port: number;
	logDir: string;
	host: string;
}
const DEFAULT_OPTIONS = {
	logDir: 'logs',
};
const configuarableToArgName: Record<keyof TensorboardArgs, string> = {
	host: '--host',
	port: '--port',
	logDir: '--logdir',
}


class TerminalService implements vscode.Disposable {
	private terminal?: vscode.Terminal;
	private disposables: vscode.Disposable[] = [];

	dispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
	async ensureTerminal() {
		if (!this.terminal) {
			this.terminal = vscode.window.createTerminal({
				name: 'Tensorboard',
				hideFromUser: false,
			} as vscode.TerminalOptions);
			this.disposables.push(
				vscode.window.onDidCloseTerminal(terminal => {
					if (terminal === this.terminal) {
						this.terminal = undefined;
					}
				}),
			);
			await sleep(1000);
		}
		return this.terminal;
	}

	get active(): boolean {
		return this.terminal !== undefined;
	}
}

let _terminalService: TerminalService;
function terminalService() {
	if (!_terminalService) {
		_terminalService = new TerminalService();
	}
	return _terminalService;
}


async function startTensorboardInTerminal(options: Partial<Config>) {
	// take the default options and merge them with the user's options
	const config = { ...DEFAULT_OPTIONS, ...options };

	const commandArgs = (Object.entries(config) as [keyof TensorboardArgs, any][])
		.filter(([key, _]) => key in configuarableToArgName)
		.filter(([_, value]) => value !== undefined)
		.map(([key, value]) => `${configuarableToArgName[key]} ${value}`)
		.join(' ');

	const command = `tensorboard ${commandArgs}`;

	if (terminalService().active) {
		const selection = await vscode.window.showInformationMessage('Tensorboard is already running', 'Stop and start new instance', 'Cancel');
		if (selection === 'Stop and start new instance') {
			(await terminalService().ensureTerminal()).sendText("\x03")
			await sleep(1000);
		}
		else {
			return;
		}
	}
	const terminal = await terminalService().ensureTerminal();

	terminal.sendText(command);
	if (config.host && config.port) {
		const url = `http://${config.host}:${config.port}`;
		return url;
	}
	else {
		return undefined;
	}
}

async function startTensorboardUsingPythonExtension(logdir: string) {

	const pythonExtension = vscode.extensions.getExtension('ms-python.python');
	if (!pythonExtension) {
		vscode.window.showErrorMessage('Python extension is not installed');
		return;
	}

	await pythonExtension.activate();

	let commandName = 'python.launchTensorBoard';
	let hasCommand = await vscode.commands.getCommands(true).then(commands => commands.includes(commandName));

	if (!hasCommand) {
		vscode.window.showErrorMessage('Missing command "python.launchTensorBoard". Maybe the python extension is outdated or is not compatible anymore');
	}

	return vscode.commands.executeCommand(commandName, logdir);
}


export async function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(terminalService());

	const pythonExtension = vscode.extensions.getExtension('ms-python.python');
	if (!pythonExtension) {
		vscode.window.showErrorMessage('Tensorboard extension requires python extension to be installed');
		return;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'tensorboard-file-explorer-context-menu.start-tensorboard-this-dir', async (p) => {

				await pythonExtension.activate();

				const runUsingTerminal = async (): Promise<any> => {
					const url = await startTensorboardInTerminal({ logDir: p.fsPath });
					if (!url) {
						return;
					}
					// if (await urlExist(url)) { // Not supported yet
					return vscode.window.showInformationMessage(`Tensorboard is running at [${url}](${url})`, 'Open in browser')
						.then(async (selection) => {
							if (selection === 'Open in browser') {
								vscode.env.openExternal(vscode.Uri.parse(url));
							}
						});
					// } else {
					// 	return vscode.window.showErrorMessage('failed to start tensorboard', "Try again")
					// 		.then(async (selection) => {
					// 			if (selection === 'Try again') {
					// 				return run();
					// 			}
					// 		});
					// }
				}

				const runUsingPythonExtension = async (): Promise<any> => {
					return startTensorboardUsingPythonExtension(p.fsPath);
				}

				return runUsingPythonExtension().catch(async (err) => {
					console.error(err);
					return runUsingTerminal();
				});
			}
		));

}

// this method is called when your extension is deactivated
export function deactivate() { }

export async function sleep(timeout: number): Promise<number> {
	return new Promise<number>((resolve) => {
		setTimeout(() => resolve(timeout), timeout);
	});
}