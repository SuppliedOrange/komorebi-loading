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
