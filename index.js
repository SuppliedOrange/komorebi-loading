const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn, exec } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const logFileName = "./logs/waitForMeKomorebi.log";
let logLevel = process.env.LOG_LEVEL || "DEBUG";

let startupAttempts = 0;
let maxStartupAttempts = 8;

let loadedConfig = {};
const defaultConfig = {

	name: null,
	welcome_message: "Bienvenue",
	skip_taskbar: false, // Whether or not to make an icon show up in the task bar for this application.

	// Recreated from runnin the command "komorebic start --help"
	/**
        -c, --config <CONFIG>      Path to a static configuration JSON file
        -a, --await-configuration  Wait for 'komorebic complete-configuration' to be sent before processing events
        -t, --tcp-port <TCP_PORT>  Start a TCP server on the given port to allow the direct sending of SocketMessages
            --whkd                 Start whkd in a background process
            --ahk                  Start autohotkey configuration file
            --bar                  Start komorebi-bar in a background process
            --masir                Start masir in a background process for focus-follows-mouse
            --clean-state          Do not attempt to auto-apply a dumped state temp file from a previously running instance of komorebi
        -h, --help                 Print help
        */

	launch_options: {
		bar: true,
		whkd: true,
		masir: true,
		clean_state: false,
		await_configuration: false,

		tcp_port: null,
		config_file_path: null,
	},

	custom_args: [
		// You can add custom args if you want i guess
	],
	log_level: "DEBUG",

};

/**
 * Creates and configures the main Electron window
 * Sets up window properties, loads HTML content, and sends initial config data.
 * The window is created with `show: false` to prevent showing uninitialized content before it loads;
 * it is then shown in the 'ready-to-show' event.
 * Please modify window properties for yourself.
 */
const createWindow = () => {

	const config = loadConfig();
	loadedConfig = config;

	// Set config log level to the one specified in the config file, if present

	if (config.log_level) {

		logLevel = config.log_level;

		log(`Log level set to ${logLevel} from config`, "INFO");

	}

	log("Creating main window", "INFO");
	
	const win = new BrowserWindow({

		width: 350,
		height: 400,
		title: "WaitForMeKomorebi",
		titleBarStyle: "hidden",
		fullscreenable: false,
		skipTaskbar: config.skipTaskbar,
		icon: path.join(__dirname, "assets", "cat.ico"),
		show: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},

	});

	log(`Window created with properties: width=${win.getBounds().width}, height=${win.getBounds().height}, title=${win.getTitle()}, skipTaskbar=${config.skipTaskbar}`, "INFO");

	win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	win.setAlwaysOnTop(true, "screen-saver", 1);
	win.setMenu(null);
	win.loadURL(`file://${__dirname}/index.html`);

	log(`Window loaded with URL: file://${__dirname}/index.html`, "INFO");

	win.once("ready-to-show", () => {

		log("Window is ready to show", "INFO");
		win.show();

	});

	// Send config data when the window content is loaded
	win.webContents.once("dom-ready", () => {

		log("Window DOM is ready, sending config data", "INFO");

		log(`Sending config data to renderer: ${JSON.stringify(loadedConfig)}`, "DEBUG");

		win.webContents.send("configData", loadedConfig);

	});

	// For debugging
	//win.webContents.openDevTools({ mode: 'detach' })

	global.win = win;

	log("Main window creation complete", "INFO");

};

/**
 * Checks if a specific process is running on the system
 * @param {string} query - The process name to search for
 * @returns {Promise<boolean>} - True if the process is running, false otherwise
 */
async function isRunning(query) {

	let platform = process.platform;

	log(`Checking if process "${query}" is running on platform: ${platform}`, "INFO");

	if (platform !== "win32") {

		log(`Found unsupported platform: ${platform}.`, "ERROR");

		throw new Error(
			`This application was built for Windows only and cannot run on this system (platform = ${platform}, expected win32).`,
		);

	}

	log(`Executing tasklist to check for process: ${query}`, "INFO");

	return new Promise((resolve, reject) => {

		exec("tasklist", (err, stdout, stderr) => {

			log(`tasklist output received: ${stdout}`, "DEBUG");

			if (err) {

				log(`Error executing tasklist: ${err}`, "ERROR");

				reject(err);

			} else {

				log(`Found process "${query}" running: ${stdout.toLowerCase().indexOf(query.toLowerCase()) > -1}`, "INFO");

				resolve(stdout.toLowerCase().includes(query.toLowerCase()));

			}

		});

	});

}

/**
 * Checks if both Komorebi and Komorebi-bar processes are running
 * @returns {Promise<boolean>} - True if both processes are running, false otherwise
 */
async function checkIfKomorebiIsRunning(config) {

	try {

		log("Checking if Komorebi is running", "INFO");

		const isKomorebiRunning = await isRunning("komorebi.exe");

		log(`Komorebi running: ${isKomorebiRunning}`, "INFO");

		log(`komorebi-bar check? ${config.launch_options.bar}`, "INFO");

		if (config.launch_options.bar) {

			const isKomorebiBarRunning = await isRunning("komorebi-bar.exe");

			log(`Komorebi-bar running: ${isKomorebiBarRunning}.`, "INFO");

			return isKomorebiRunning && isKomorebiBarRunning;

		} 
		
		else return isKomorebiRunning;

	} catch (err) {

		await log(`Error checking if Komorebi is running: ${err}`, "ERROR");
		return false;

	}

}

/**
 * Checks which of the given processes are currently running (Windows only)
 * and returns their PID if found.
 * @param {string[]} processNames - List of executable names (e.g., "komorebi.exe")
 * @returns {Promise<Object>} Resolves to an object where each key is a process name (exactly as passed) and the value is { running: boolean, pid: number|null }
 */

async function getProcessesStatus(processNames) {

    return new Promise((resolve, reject) => {

		log(`Checking status of processes: ${processNames.join(", ")}`, "INFO");

        // tasklist /fo csv gives CSV output; /nh removes the header row

        exec('tasklist /fo csv /nh', (err, stdout, stderr) => {

            log(`tasklist output received: ${stdout}`, "DEBUG");

            if (err) {

                log(`Error executing tasklist: ${err}`, "ERROR");

                reject(err);
                return;

            }

            const status = {};

            // Initialize all requested processes as not running
            for (const name of processNames) {

                status[name] = { running: false, pid: null };

            }
	
			const lines = stdout.trim().split(/\r?\n/);

			// log(`Lines parsed:\n${lines}`, "DEBUG");

            const lowerNames = processNames.map(n => n.toLowerCase());

            for (const line of lines) {

				log(`Processing line: ${line}`, "SILLY");

                // Example line: "System Idle Process","0","Services","0","8 K"

                const parts = line.split('","').map(s => s.replace(/^"|"$/g, ''));

				log(`Parsed parts: ${parts}`, "SILLY");

                if (parts.length < 2) continue;

                const imageName = parts[0];          // e.g., "komorebi.exe"

                const pid = Number.parseInt(parts[1], 10);  // e.g., 1234

                const lowerImage = imageName.toLowerCase();

                const index = lowerNames.indexOf(lowerImage);

                if (index !== -1) {

                    // Match found – use the original process name string as key

					log(`FOUND process ${imageName} is running with PID ${pid}`, "INFO");
                    status[processNames[index]] = { running: true, pid };

                }
				
            }

			log(`Final process status: ${JSON.stringify(status)}`, "INFO");

            resolve(status);

        });

    });

}

/**
 * Gradually fades out the main window by reducing opacity over time
 * @returns {Promise<void>} - Resolves when the fade out animation is complete
 */
async function fadeOutWindow() {

	return new Promise((resolve) => {

		const duration = 500; // 0.5 seconds
		const steps = 60;
		const fadeInterval = duration / steps;
		const fadeStep = 1 / steps;

		let opacity = 1.0;

		log("Starting fade out of window", "INFO");
		log(`Fade out parameters: duration=${duration}ms, steps=${steps}, fadeInterval=${fadeInterval}ms, fadeStep=${fadeStep}`, "DEBUG");

		const timer = setInterval(() => {

			opacity -= fadeStep;

			if (opacity <= 0) {

				clearInterval(timer);
				resolve();

			}

			if (global.win) {

				try {

					global.win.setOpacity(Math.max(0, opacity));

				} catch (e) {

					log("Error setting opacity", "INFO");

				}

			}

			else {

				log(`global.win is not defined during fade out. Opacity: ${opacity}`, "ERROR");

			}

		}, fadeInterval);

	});

}

/**
 * Starts the Komorebi window manager process and handles its lifecycle
 * Monitors the process, checks if it starts successfully, and retries up to the max retry limit.
 * @param {boolean} skipDuplicationChecker - If true, skips checking if Komorebi is already running
 */
async function startLoadingKomorebi(skipDuplicationChecker = false) {

	log("Starting Komorebi loading process", "INFO");

	let launchOptions = ["start"];

	if (loadedConfig.launch_options.bar) {
		launchOptions.push("--bar");
	}

	if (loadedConfig.launch_options.whkd) {
		launchOptions.push("--whkd");
	}

	if (loadedConfig.launch_options.masir) {
		launchOptions.push("--masir");
	}

	if (loadedConfig.launch_options.clean_state) {
		launchOptions.push("--clean-state");
	}

	if (loadedConfig.launch_options.await_configuration) {
		launchOptions.push("--await-configuration");
	}

	if (

		loadedConfig.launch_options.tcp_port !== 0 &&
		loadedConfig.launch_options.tcp_port !== null

	) {

		launchOptions.push(
			`--tcp-port=${loadedConfig.launch_options.tcp_port.toString()}`,
		);
		
	}

	if (loadedConfig.launch_options.config_file_path) {

		launchOptions.push(
			`--config=${loadedConfig.launch_options.config_file_path.toString()}`,
		);

	}

	if (loadedConfig.custom_args && Array.isArray(loadedConfig.custom_args)) {

		for (const arg of loadedConfig.custom_args) {
			if (arg) launchOptions.push(arg.toString());
		}

	}

	log(
		`Starting Komorebi with options: komorebic ${launchOptions.join(" ")}`,
		"INFO",
	);

	const komo_running = await checkIfKomorebiIsRunning(loadedConfig);

	// If komorebi is not running or komorebi is running and we don't really care.

	log(`Komorebi running: ${komo_running}, skipDuplicationChecker: ${skipDuplicationChecker}`, "INFO");

	if ( !komo_running || skipDuplicationChecker ) {

		log("Spawning Komorebi process", "INFO");

		const komorebi = spawn("komorebic", launchOptions);

		komorebi.on("error", (err) => {
			log(err.toString(), "ERROR");
		});

 		komorebi.stdout?.on("data", (data) => {

 			log(data.toString(), "INFO");

 		});

 		komorebi.stderr?.on("data", (data) => {

 			log(data.toString(), "ERROR");

 		});

		komorebi.on("close", async (code) => {

			if (code === 0) {

				if (await checkIfKomorebiIsRunning(loadedConfig)) {

					log("Komorebi started successfully", "INFO");

					try {

						global.win.webContents.send("komorebiStatus", {
							status: true,
						});

					} 
					
					catch (e) {

						log("Failed to send komorebi Status message", "ERROR");

					}

					await new Promise((r) => setTimeout(r, 2000));
					await fadeOutWindow();

					process.exit();

				} else {

					if (startupAttempts >= maxStartupAttempts) {

						log("Max startup attempts reached", "ERROR");

						win.webContents.send("komorebiStatus", {
							status: false,
							error: "Max startup attempts reached",
						});

						startupAttempts = 0;
						return;
					}

					log(
						"Komorebi claimed to start but did not. Retrying.",
						"WARN",
					);

					startupAttempts += 1;

					startLoadingKomorebi();

				}

			} else {

				log("Komorebi failed to start", "ERROR");

				global.win.webContents.send("komorebiStatus", {
					status: false,
					error: "Komorebi failed to start",
				});

			}

		});

	}
	
	else {

		log("Komorebi is already running. Sending duplication warning to renderer.", "WARN");

		// Everything the komorebi ecosystem has rn that im aware of.

		const processNames = [

			"komorebi.exe",
			"komorebi-bar.exe",
			"whkd.exe",
			"masir.exe",

		];

		const statuses = await getProcessesStatus(processNames);

		const processes = Object.entries(statuses)
			.filter(([name, info]) => info.running)
			.map(([name, info]) => ({ name, pid: info.pid }));

		log(`Komorebi and associated processes that will be send to renderer: ${JSON.stringify(processes)}`, "INFO");

		win.webContents.send("komorebiStatus", {
			status: false,
			error: "Komorebi is running! Choose whether you want to invoke the start process anyway or kill komorebi & optionally it's associated processes.",
			title: "Duplication!",
			processes,
		});

	}

}

/**
 * Ensures the logs directory exists, creating it if necessary
 */
function ensureLogDirectoryExists() {

	console.log("[INFO] Ensuring log directory exists");

	try {

		const logDir = path.dirname(logFileName);

		console.log(`[DEBUG] Log directory path: ${logDir}`);

		fs.mkdirSync(logDir, { recursive: true });

	} catch (err) {

		console.log("[ERROR] Failed to ensure log directory exists:", err);

	}

}

/**
 * Clears the contents of the log file
 */
async function clearLog() {

	log("Clearing log file", "INFO");

	try {

		ensureLogDirectoryExists();
		fs.writeFileSync(logFileName, "", { flag: "w" });

		log("Log file cleared successfully", "INFO");

	} catch (err) {

		log(`Failed to clear log file: ${err.message}`, "ERROR");

	}

}

/**
 * Appends a message to the log file with a log level
 * @param {string} message - The message to log
 * @param {string} type - The log level (INFO, ERROR, WARN, etc.)
 */
async function log(message, type) {

	switch (logLevel.toUpperCase()) {

		case "SILLY":
			// Log everything
			break;

		case "DEBUG":

			if (type === "SILLY") return;
			break;

		case "INFO":

			if (type === "SILLY" || type === "DEBUG") return;
			break;

		case "WARN":

			if (type === "SILLY" || type === "DEBUG" || type === "INFO") return;
			break;

		case "ERROR":

			if (type !== "ERROR") return;
			break;

		default: 

			log(`Unknown log level: ${logLevel}. Defaulting to DEBUG.`, "WARN");

			if (type === "SILLY") return;
			break;

	}


	try {

		ensureLogDirectoryExists();

		console.log(`[${type}] ${message}`);
		fs.appendFileSync(logFileName, `[${type}] ${message}\n`);

	} catch (err) {

		console.error("Failed to write to log file:", err);

	}

}

/**
 * Updates the "I'm starting up..." message continuously with trailing dots
 */
function setLoadingMessage() {

	log("Setting up loading message interval", "INFO");

	let trailingDots = 1;

	setInterval(() => {

		if (trailingDots > 2) trailingDots = 0;

		trailingDots = trailingDots + 1;

		const message = "I'm starting up " + ".".repeat(trailingDots);

		try {

			if (global.win) {

				global.win.webContents.send("loadingMessage", message);

			} 
			
			else {

				log(
					"Attempted to send `loadingMessage` through webContents but global.win is not defined",
					"ERROR",
				);

			}

		} catch (e) {

			log(`Failed to send loading message (window is probably gone): ${e.message}`, "WARN");
			// Window is prolly gone.
			process.exit();

		}

	}, 400);

}

/**
 * Loads configuration from config.json file
 * First checks AppData folder, creates it if it doesn't exist
 * Falls back to OS username if no name is specified in the config
 * @returns {Object} - Object containing name and welcome_message properties
 */
const loadConfig = () => {

	log("Loading configuration", "INFO");

	// Routes to <windows-drive>:\Users\<username>\AppData\Roaming\komorebi-loading

	const appDataPath = path.join(
		process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
		"komorebi-loading",
	);

	log(`AppData path: ${appDataPath}`, "DEBUG");

	const userConfigPath = path.join(appDataPath, "config.json");

	log(`User config path: ${userConfigPath}`, "DEBUG");

	try {
		// Try to load from user's AppData first

		if (fs.existsSync(userConfigPath)) {

			log(`Config file exists at: ${userConfigPath}. Loading from it.`, "INFO");

			const configData = fs.readFileSync(userConfigPath, "utf8");
			const config = JSON.parse(configData);

			log(`Config data loaded: ${JSON.stringify(config)}`, "DEBUG");

			// If some fields are missing, fill with defaults

			for (const key in defaultConfig) {

				if (!config.hasOwnProperty(key)) {

					config[key] = defaultConfig[key];
					log(`Using default value for key: ${key} as ${JSON.stringify(defaultConfig[key])}`, "DEBUG");
				} 
				
				else if (

					key === "launch_options" &&
					typeof config[key] !== "object"

				) {

					config[key] = defaultConfig[key];
					log(`Using default value for key: ${key} as ${JSON.stringify(defaultConfig[key])}`, "DEBUG");

				} 
				
				else if (

					key === "custom_args" &&
					!Array.isArray(config[key])

				) {

					config[key] = defaultConfig[key];
					log(`Using default value for key: ${key} as ${JSON.stringify(defaultConfig[key])}`, "DEBUG");

				}

			}

			// Re-update in case some fields were missing

			fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 4));

			log(`Re-updated config file at: ${userConfigPath}`, "INFO");

			return config;
		}

		// Create AppData directory if it doesn't exist
		
		if (!fs.existsSync(appDataPath)) {

			fs.mkdirSync(appDataPath, { recursive: true });
			log(`Created AppData directory at: ${appDataPath}`, "INFO");

		}

		// Create user config file

		fs.writeFileSync(
			userConfigPath,
			JSON.stringify(defaultConfig, null, 4),
		);

		log(`Created config file at: ${userConfigPath}`, "INFO");

		// If no name is set, use OS username

		if (!defaultConfig.name) {

			log(`Config name is set to ${defaultConfig.name}. Using OS username ${os.userInfo().username}.`, "INFO");
			defaultConfig.name = os.userInfo().username;

		}

		return defaultConfig;

	} catch (error) {

		log(`Failed to load config: ${error.message}`, "ERROR");

		return {
			...defaultConfig,
			name: os.userInfo().username,
			welcome_message: "Bienvenue",
		};
		
	}

};

app.whenReady().then(() => {

	log("App ready", "INFO");

	log("Clearing log.", "INFO");
	clearLog();

	log("Creating window.", "INFO");
	createWindow();

	log("Setting loading message.", "INFO");
	setLoadingMessage();

	log("Starting Komorebi loading process.", "INFO");
	startLoadingKomorebi();
	
});

ipcMain.on("showLogs", () => {

	log(`showLogs event received. Attempting to open log file at ${path.resolve(logFileName)}`, "INFO");

	try {

		shell.openPath(path.resolve(logFileName));
	}

	catch (err) {

		log(`Failed to open log file: ${err}`, "ERROR");

	}

});

ipcMain.on("retry", () => {

	log("Retry event received. Invoking startLoadingKomorebi.", "INFO");
	startLoadingKomorebi();

});

ipcMain.on("forceStart", () => {

    log("Force start event received. Invoking startLoadingKomorebi.", "INFO");
    startLoadingKomorebi(true);

});

ipcMain.on("killProcesses", async (event, pids) => {

	log(`killProcesses event received with PIDs: ${JSON.stringify(pids)}`, "INFO");

	if (!Array.isArray(pids) || pids.length === 0) {

		log("No PIDs provided to killProcesses event. Exiting.", "WARN");
		return;

	}

	const results = {

		killed: [],
		failed: [],
		stillRunning: []

	};

	// Kill each PID sequentially (so we can log each)

	for (const pid of pids) {

		log(`Attempting to kill process with PID: ${pid}`, "INFO");

		try {

			await new Promise((resolve, reject) => {

				exec(`taskkill /PID ${pid} /F`, (err, stdout, stderr) => {
					
					log(`taskkill output for PID ${pid}: ${stdout}`, "DEBUG");
					log(`taskkill error for PID ${pid}: ${stderr}`, "DEBUG");
					log(`taskkill error object for PID ${pid}: ${err}`, "DEBUG");

					if (err) reject(err);
					else resolve();

				});

			});

			results.killed.push(pid);

			log(`Killed process with PID ${pid}`, "INFO");

		} catch (e) {

			results.failed.push({ pid, error: e.message || e.toString() });
			log(`Failed to kill PID ${pid}: ${e.message}`, "ERROR");

		}
	}

	log(`Kill results: ${JSON.stringify(results)}`, "INFO");

	// After killing, wait a short moment then check which processes are still running
	await new Promise(r => setTimeout(r, 2000));

	const processNames = [
		"komorebi.exe",
		"komorebi-bar.exe",
		"whkd.exe",
		"masir.exe"
	];

	try {

		log("Getting process statuses after kill operation.", "INFO");

		const statuses = await getProcessesStatus(processNames);

		log(`Process statuses after kill: ${JSON.stringify(statuses)}`, "INFO");

		results.stillRunning = Object.entries(statuses)
			.filter(([name, info]) => info.running)
			.map(([name, info]) => ({ name, pid: info.pid }));

		log(`Processes still running after kill: ${JSON.stringify(results.stillRunning)}`, "INFO");

	} catch (e) {

		log(`Error re-checking processes after kill: ${e.message}`, "ERROR");

		results.stillRunning = [];

	}

	// Send results to renderer

	if (global.win) {

		log("Sending kill results to renderer.", "INFO");

		global.win.webContents.send("killResult", results);

	}

	else {

		log("global.win is not defined when trying to send killResult. Cannot send results to renderer.", "ERROR");

	}

});

ipcMain.on("minimizeWindow", () => {

	log("minimizeWindow event received.", "INFO");

	if (global.win) {

		log("Minimizing main window.", "INFO");
		global.win.minimize();

	}

	else {

		log("global.win is not defined when trying to minimize window.", "ERROR");

	}

});

ipcMain.on("closeWindow", () => {

	log("closeWindow event received.", "INFO");

	if (global.win) {

		log("Closing main window.", "INFO");
		global.win.close();

	}

	else {

		log("global.win is not defined when trying to close window.", "ERROR");

	}

});

app.on("window-all-closed", () => {
	
	log("All windows closed. Quitting app.", "INFO");

	log(`Current platform: ${process.platform}`, "DEBUG");

	if (process.platform !== "darwin") app.quit();

});
