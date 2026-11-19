# rnlogger workspace

npm workspace holding the publishable library and a demo app side by side.

- [`react-native-unified-logger/`](react-native-unified-logger/README.md): the Turbo Module library (TypeScript, Objective-C/Objective-C++, Kotlin). Its README is the user documentation.
- [`example/`](example/): a bare React Native 0.88.1 app (`LoggerDemo`) that depends on the library through the workspace and demonstrates logging from JS, Swift and Kotlin, the callback, `localDestination` and `minLevel`.
- [`DEV_REPORT.md`](DEV_REPORT.md): obstacles hit while building this, mostly dev-environment related.
- [`research-console-forwarding.md`](research-console-forwarding.md): how React Native itself forwards `console.*` to native logs (source-level notes that informed the design).

## Setup

```bash
nvm use
```

```bash
npm install
```

```bash
npm run pods --workspace example
```

## Checks

Library unit tests (including the shipped Jest mock):

```bash
npm test
```

Type checks for the library and the example app:

```bash
npm run typecheck
```

The example app's own render test:

```bash
npm test --workspace example
```

## Run the demo

Start Metro from `example/` (`npm start --workspace example`), then in another terminal:

```bash
npm run ios --workspace example
```

```bash
npm run android --workspace example
```

Watch native output while using the app:

```bash
xcrun simctl spawn booted log stream --level debug --predicate 'subsystem == "org.reactjs.native.example.LoggerDemo"'
```

```bash
adb logcat -s LoggerDemo:V Lifecycle:V App:V Network:V ReactNativeJS:V
```

## Publishing the library

From `react-native-unified-logger/`: `npm publish` runs `bob build` through the `prepare` script and ships `src`, `lib`, `ios`, `android` and the podspec (see `files` in its package.json; `npm pack --dry-run` shows the exact list).
