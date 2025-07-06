const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const logFileName = './logs/waitForMeKomorebi.log';
let startupAttempts = 0;
let maxStartupAttempts = 8;

/**
 * Creates and configures the main Electron window
 * Sets up window properties, loads HTML content, and sends initial config data
 * Please modify window properties for yourself.
 */
const createWindow = () => {

    const win = new BrowserWindow({
      width: 350,
      height: 400,
      title: "WaitForMeKomorebi",
      titleBarStyle: 'hidden',
      fullscreenable: false,
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
    let cmd = '';

    switch (platform) {
        case 'win32': cmd = `tasklist`; break;
        case 'darwin': cmd = `ps -ax | grep ${query}`; break;
        case 'linux': cmd = `ps -A`; break;
        default: break;
    }

    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
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
async function checkIfKomorebiIsRunning() {
    return await isRunning('komorebi.exe') && isRunning('komorebi-bar.exe');
}

/**
 * Gradually fades out the main window by reducing opacity over time
 * @returns {Promise<void>} - Resolves when the fade out animation is complete
 */
async function fadeOutWindow() {

    return new Promise((resolve) => {

        const duration = 500; // 3 seconds
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

            win.setOpacity(Math.max(0, opacity));

        }, fadeInterval);

    });
}

/**
 * Starts the Komorebi window manager process and handles its lifecycle
 * Monitors the process, checks if it starts successfully, and retries up to the max retry limit.
 */
async function startLoadingKomorebi() {

    const komorebi = spawn('komorebic', ['start', '--bar', '--whkd']);

    komorebi.on('error', (err) => {
        console.log(err)
        log(err.toString(), 'ERROR');
    });

    komorebi.on('data', (data) => {
        console.log(data)
        log(data.toString(), 'INFO');
    });

    komorebi.on('close', async (code) => {

        if (code === 0) {

            if ( await checkIfKomorebiIsRunning() ) {

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
    fs.appendFileSync(logFileName, `[${type}] ${message}\n`);
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
            win.webContents.send('loadingMessage', message)
        }
        catch (e) {
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

    // Use APPDATA environment variable directly to match the batch file
    const appDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'komorebi-loading');
    const userConfigPath = path.join(appDataPath, 'config.json');
    
    try {

        // Try to load from user's AppData first

        if (fs.existsSync(userConfigPath)) {

            const configData = fs.readFileSync(userConfigPath, 'utf8');
            const config = JSON.parse(configData);

            log(`Loaded config file from: ${userConfigPath}`, 'INFO');
            log(`Config data: ${JSON.stringify(config, null, 4)}`, 'DEBUG');

            // If no name is set, use OS username
            if (!config.name || config.name.trim() === '') {
                config.name = os.userInfo().username;
            }

            return config;

        }

        const defaultConfig = {
            name: "",
            welcome_message: "Bienvenue"
        };
        
        // Create AppData directory if it doesn't exist
        if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath, { recursive: true });
        }
        
        // Create user config file
        fs.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, 4));
        log(`Created config file at: ${userConfigPath}`, 'INFO');
        
        // If no name is set, use OS username
        if (!defaultConfig.name || defaultConfig.name.trim() === '') {
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