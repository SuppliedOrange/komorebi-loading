const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logFileName = './logs/waitForMeKomorebi.log';
let startupAttempts = 0;
let maxStartupAttempts = 8;

const defaultConfig = {

    name: null,
    welcome_message: "Bienvenue",
    skipTaskbar: false, // Whether or not to make an icon show up in the task bar for this application.

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

};

/**
 * Creates and configures the main Electron window
 * Sets up window properties, loads HTML content, and sends initial config data
 * Please modify window properties for yourself.
 */
const createWindow = () => {

    const config = loadConfig();

    const win = new BrowserWindow({
      width: 350,
      height: 400,
      title: "WaitForMeKomorebi",
      titleBarStyle: 'hidden',
      fullscreenable: false,
      skipTaskbar: config.skipTaskbar,
      icon: path.join(__dirname, 'assets', 'cat.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    })

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setMenu(null)
    win.loadURL(`file://${__dirname}/index.html`)

    // Send config data when the window content is loaded
    win.webContents.once('dom-ready', () => {
        const config = loadConfig();
        win.webContents.send('configData', config);
    });

    // For debugging
    // win.webContents.openDevTools({ mode: 'detach' })

    global.win = win;

}

/**
 * Checks if a specific process is running on the system
 * @param {string} query - The process name to search for
 * @returns {Promise<boolean>} - True if the process is running, false otherwise
 */
async function isRunning(query) {

    let platform = process.platform;

    if (platform !== 'win32') {

        throw new Error("Komorebi at the moment runs on Windows only and your OS is not supported.");

    }

    return new Promise((resolve, reject) => {

        exec('tasklist', (err, stdout, stderr) => {

            if (err) {

                reject(err);

            } else {
                
                resolve(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
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

        const isKomorebiRunning = await isRunning('komorebi.exe');

        if (config.launch_options.bar) {

            const isKomorebiBarRunning = await isRunning('komorebi-bar.exe');
            return isKomorebiRunning && isKomorebiBarRunning;

        } else {

            return isKomorebiRunning;

        }

    } catch (err) {

        await log(`Error checking if Komorebi is running: ${err}`, 'ERROR');
        return false;

    }

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

        const timer = setInterval(() => {

            opacity -= fadeStep;

            if (opacity <= 0) {
                clearInterval(timer);
                resolve();
            }

            if (global.win) {
                global.win.setOpacity(Math.max(0, opacity));
            }

        }, fadeInterval);

    });
}

/**
 * Starts the Komorebi window manager process and handles its lifecycle
 * Monitors the process, checks if it starts successfully, and retries up to the max retry limit.
 */
async function startLoadingKomorebi() {

    const config = loadConfig();

    let launchOptions = ["start"];

    if (config.launch_options.bar) {
        launchOptions.push('--bar');
    }

    if (config.launch_options.whkd) {
        launchOptions.push('--whkd');
    }

    if (config.launch_options.masir) {
        launchOptions.push('--masir');
    }

    if (config.launch_options.clean_state) {
        launchOptions.push('--clean-state');
    }

    if (config.launch_options.await_configuration) {
        launchOptions.push('--await-configuration');
    }

    if (config.launch_options.tcp_port !== 0 && config.launch_options.tcp_port !== null) {
        launchOptions.push(`--tcp-port=${config.launch_options.tcp_port.toString()}`);
    }

    if (config.launch_options.config_file_path) {
        launchOptions.push(`--config=${config.launch_options.config_file_path.toString()}`);
    }

    if (config.custom_args && Array.isArray(config.custom_args)) {

        for (const arg of config.custom_args) {
            if (arg) launchOptions.push(arg.toString());
        }

    }

    log(`Starting Komorebi with options: komorebic ${launchOptions.join(' ')}`, 'INFO');

    const komorebi = spawn('komorebic', launchOptions);

    komorebi.on('error', (err) => {
        log(err.toString(), 'ERROR');
    });

    komorebi.on('data', (data) => {
        log(data.toString(), 'INFO');
    });

    komorebi.on('close', async (code) => {

        if (code === 0) {

            if ( await checkIfKomorebiIsRunning(config) ) {

                log('Komorebi started successfully', 'INFO');
                
                try {
                    win.webContents.send('komorebiStatus', { status: true });
                }
                catch (e) {
                    log('Failed to send komorebiStatus message', 'ERROR');
                }
                
    
                await new Promise(r => setTimeout(r, 2000));
                await fadeOutWindow();
    
                process.exit();

            }

            else {

                if (startupAttempts >= maxStartupAttempts) {
                    log('Max startup attempts reached', 'ERROR');
                    win.webContents.send('komorebiStatus', { status: false, error: 'Max startup attempts reached', logPath: path.resolve(logFileName) });
                    startupAttempts = 0;
                    return;
                }

                log('Komorebi claimed to start but did not. Retrying.', 'WARN');
                startupAttempts += 1;
                startLoadingKomorebi();

            }

        }

        else {
            log('Komorebi failed to start', 'ERROR');
            win.webContents.send('komorebiStatus', { status: false, error: code, logPath: path.resolve(logFileName) });
        }
        
    });

}

/**
 * Clears the contents of the log file
 */
async function clearLog() {
    fs.writeFileSync(logFileName, '', { flag: 'w' });
}

/**
 * Appends a message to the log file with a log level
 * @param {string} message - The message to log
 * @param {string} type - The log level (INFO, ERROR, WARN, etc.)
 */
async function log(message, type) {

    try {

        fs.appendFileSync(logFileName, `[${type}] ${message}\n`);

    } catch (err) {
        console.error('Failed to write to log file:', err);
    }

}

/**
 * Updates the "I'm starting up..." message continuously with trailing dots
 */
function setLoadingMessage() {

    let trailingDots = 1;

    setInterval(() => {

        if (trailingDots > 2) {
            trailingDots = 0;
        }

        trailingDots = trailingDots + 1

        const message = "I'm starting up " + ".".repeat(trailingDots)

        try {

            if (global.win) {
                global.win.webContents.send('loadingMessage', message)
            }
            else {
                log('Attempted to send `loadingMessage` through webcontents but global.win is not defined', 'ERROR');
            }

        }
        catch (e) {

            // Window is prolly gone.
            process.exit();

        }

    }, 400)

}

/**
 * Loads configuration from config.json file
 * First checks AppData folder, creates it if it doesn't exist
 * Falls back to OS username if no name is specified in the config
 * @returns {Object} - Object containing name and welcome_message properties
 */
const loadConfig = () => {

    // Routes to <windows-drive>:\Users\<username>\AppData\Roaming\komorebi-loading

    const appDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'komorebi-loading');
    const userConfigPath = path.join(appDataPath, 'config.json');
    
    try {

        // Try to load from user's AppData first

        if (fs.existsSync(userConfigPath)) {

            const configData = fs.readFileSync(userConfigPath, 'utf8');
            const config = JSON.parse(configData);

            // If some fields are missing, fill with defaults
            for (const key in defaultConfig) {

                if (!config.hasOwnProperty(key)) {
                    config[key] = defaultConfig[key];
                }

                else if (key === 'launch_options' && typeof config[key] !== 'object') {
                    config[key] = defaultConfig[key];
                }

                else if (key === 'custom_args' && !Array.isArray(config[key])) {
                    config[key] = defaultConfig[key];
                }

            }

            // Re-update in case some fields were missing
            fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 4));

            log(`Loaded config file from: ${userConfigPath}`, 'INFO');
            log(`Config data: ${JSON.stringify(config, null, 4)}`, 'DEBUG');

            return config;

        }
        
        // Create AppData directory if it doesn't exist
        if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath, { recursive: true });
        }
        
        // Create user config file
        fs.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, 4));
        log(`Created config file at: ${userConfigPath}`, 'INFO');
        
        // If no name is set, use OS username
        if (!defaultConfig.name) {

            defaultConfig.name = os.userInfo().username;

        }

        return defaultConfig;

    } catch (error) {

        log(`Failed to load config: ${error}`, 'ERROR');

        return {
            name: os.userInfo().username,
            welcome_message: "Bienvenue"
        };

    }
};

app.whenReady().then(() => {

    clearLog();

    createWindow();
    setLoadingMessage();

    startLoadingKomorebi();

})

ipcMain.on('showLogs', () => {
    shell.openPath(path.resolve(logFileName))
    .catch(err => console.error('Failed to open logs:', err));
});

ipcMain.on('retry', () => {
    startLoadingKomorebi();
});

ipcMain.on('minimizeWindow', () => {
    
    if (global.win) {
        global.win.minimize();
    }

})

ipcMain.on('closeWindow', () => {
    
    if (global.win) {
        global.win.close();
    }

})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})