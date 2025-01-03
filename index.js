const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFileName = './logs/waitForMeKomorebi.log';
let startupAttempts = 0;
let maxStartupAttempts = 8;

const createWindow = () => {

    const win = new BrowserWindow({
      width: 350,
      height: 400,
      title: "WaitForMeKomorebi",
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    })

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    win.setMenu(null)
    win.loadURL(`file://${__dirname}/index.html`)

    // For debugging
    // win.webContents.openDevTools({ mode: 'detach' })

    global.win = win;

}

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

async function checkIfKomorebiIsRunning() {
    return await isRunning('komorebi.exe') && isRunning('komorebi-bar.exe');
}

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

                win.webContents.send('komorebiStatus', { status: true });
    
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

async function clearLog() {
    fs.writeFileSync(logFileName, '', { flag: 'w' });
}

async function log(message, type) {
    fs.appendFileSync(logFileName, `[${type}] ${message}\n`);
}

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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})