# komorebi-loading

### *Wait for me, Komorebi!*

 A cute loading screen electron app for [komorebi](https://github.com/LGUG2Z/komorebi). I made this so that my system can kind of wait for komorebi to finish launching before I get started.

![image](./readme_assets/preview.gif)

## Features

- Retries launching up to 8 times if Komorebi lied and didn't start up.
- Has success / error screens
- Builds into a nice little executable
- Has logs (kinda)
- Cute

## Config

It says "Bienvenue {Your OS username}" by default once it starts. You can customize this by editing the configuration file at:

> `%APPDATA%/komorebi-loading/config.json`

You can just use the command from [open_config.bat](./open_config.bat) or [open_config.ps1](./open_config.ps1) to open it up.

## Advanced Launch Options

You can configure additional Komorebi launch options directly in your `config.json` file with these fields.

Relevant fields:

```jsonc
{
	"launch_options": {

		// Start komorebi bar
		"bar": true, 
	
	 	// Start the windows hotkey daemon (whkd)
		"whkd": true, 
	
		// Start focus-follows-mouse daemon (masir)
		"masir": true,
	
		// Whether or not to start fresh instead of using the previous dumped state temp file.
		"clean_state": false,
	
	 	// Wait for 'komorebic complete-configuration' to be sent before processing events
		"await_configuration": false,
	
		// Start a TCP server on the given port to allow the direct sending of SocketMessages
		"tcp_port": null, 
	
		// Path to a static komorebi configuration JSON file
		"config_file_path": null, 
	
		// Whether or not to show this app in the taskbar when it's active, shows by default.
		"skipTaskbar": false 

	},

	"custom_args": [
		// I wouldn't put anything here unless there's a new update to the launch config
		// that the current one doesn't cover.
		// eg. "--ahk"
	]

}
```

## Installing pre-requisites

Use this command in the directory to install dependencies

```console
npm install
```

## Running the program

Use this command in the directory to run the program

```console
npm start
# or
electron .
```

## Building using @electron/packager

Use the following command in the directory to build a binary for your system.

```console
npx @electron/packager . komorebi-loading --out=dist --icon=assets/cat.ico --overwrite
```

## komorebi.json ignore rule

You will need to make komorebi ignore this application, so it's advised to set this rule in your `komorebi.json` file first.

```json
"ignore_rules": [{
    "kind": "Title",
    "id": "WaitForMeKomorebi",
    "matching_strategy": "Contains"
}],
```


## Credits

The gif of the cat belongs to [robokoboto](https://alphacoders.com/users/profile/69089/robokoboto) and was sourced from <https://gifs.alphacoders.com/gifs/view/4244>. The license of this repository does not cover this asset as it does not belong to me.
