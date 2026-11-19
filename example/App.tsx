/**
 * Demo app for react-native-unified-logger.
 *
 * - The four JS buttons log from TypeScript.
 * - Native code logs on its own: AppDelegate (Swift) / MainApplication (Kotlin)
 *   log at startup, before JS is ready, and again every time the app returns
 *   to the foreground. Background and foreground the app to see those.
 * - "Callback" shows what a remote-logging sink would receive from every layer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  configureLogger,
  createLogger,
  getLoggerConfig,
  log,
  resetLogger,
  type LocalDestination,
  type LogEntry,
  type LogLevel,
} from 'react-native-unified-logger';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const DESTINATIONS: LocalDestination[] = [
  'platformSpecific',
  'none',
  'js',
  'native',
];
const MAX_ROWS = 200;

const netLog = createLogger('Network');

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [callbackOn, setCallbackOn] = useState(false);
  const [destination, setDestination] = useState<LocalDestination | 'default'>(
    'default',
  );
  const [minLevel, setMinLevel] = useState<LogLevel>('debug');
  const [received, setReceived] = useState<LogEntry[]>([]);
  const [counter, setCounter] = useState(0);

  // One JS entry at startup so Release builds (no DevTools) still show a JS
  // line in the native log next to the Swift/Kotlin startup entries.
  useEffect(() => {
    log.info('App mounted', { dev: __DEV__ });
  }, []);

  const sink = useCallback((entry: LogEntry) => {
    setReceived(prev => [entry, ...prev].slice(0, MAX_ROWS));
  }, []);

  useEffect(() => {
    if (destination === 'default') {
      // Go back to the derived destination (platformSpecific without a
      // callback, none with one): an explicitly chosen destination sticks
      // until resetLogger() is called.
      resetLogger();
    }
    configureLogger({
      callback: callbackOn ? sink : null,
      ...(destination === 'default' ? {} : { localDestination: destination }),
      minLevel,
    });
  }, [callbackOn, destination, minLevel, sink]);

  const effective = getLoggerConfig();

  const logFromJs = (level: LogLevel) => {
    const n = counter + 1;
    setCounter(n);
    log[level](`JS ${level} #${n}`, { n, at: new Date().toISOString() });
    if (level === 'error') {
      netLog.error('request failed', new Error('simulated timeout'));
    } else {
      netLog[level](`GET /items page=${n}`);
    }
  };

  // Dev-only hooks so the demo can be driven from a script over Metro's
  // DevTools (CDP) endpoint: globalThis.__loggerDemo.logFromJs('info') etc.
  const latest = useRef({ logFromJs, received });
  latest.current = { logFromJs, received };
  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const g = globalThis as unknown as { __loggerDemo?: unknown };
    g.__loggerDemo = {
      logFromJs: (level: LogLevel) => latest.current.logFromJs(level),
      setCallbackOn,
      setDestination,
      setMinLevel,
      clear: () => setReceived([]),
      received: () => latest.current.received,
      config: () => getLoggerConfig(),
    };
    return () => {
      delete g.__loggerDemo;
    };
  }, []);

  const contentStyle = {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 24,
    paddingHorizontal: 16,
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={contentStyle}>
      <Text style={styles.h1}>Unified Logger Demo</Text>

      <Text style={styles.h2}>Log from JS</Text>
      <View style={styles.row}>
        {LEVELS.map(l => (
          <Btn
            key={l}
            label={l}
            onPress={() => logFromJs(l)}
            testID={`js-${l}`}
          />
        ))}
      </View>

      <Text style={styles.h2}>Callback (remote sink)</Text>
      <View style={styles.row}>
        <Btn
          label={callbackOn ? 'callback: ON' : 'callback: OFF'}
          active={callbackOn}
          onPress={() => setCallbackOn(v => !v)}
          testID="toggle-callback"
        />
        <Btn label="clear" onPress={() => setReceived([])} testID="clear" />
      </View>

      <Text style={styles.h2}>localDestination</Text>
      <View style={styles.row}>
        <Btn
          label="default"
          active={destination === 'default'}
          onPress={() => setDestination('default')}
          testID="dest-default"
        />
        {DESTINATIONS.map(d => (
          <Btn
            key={d}
            label={d}
            active={destination === d}
            onPress={() => setDestination(d)}
            testID={`dest-${d}`}
          />
        ))}
      </View>

      <Text style={styles.h2}>minLevel</Text>
      <View style={styles.row}>
        {LEVELS.map(l => (
          <Btn
            key={l}
            label={l}
            active={minLevel === l}
            onPress={() => setMinLevel(l)}
            testID={`min-${l}`}
          />
        ))}
      </View>

      <Text style={styles.mono} testID="effective-config">
        effective: destination={effective.localDestination} minLevel=
        {effective.minLevel} callback={String(effective.hasCallback)}
      </Text>

      <Text style={styles.h2}>Received by callback ({received.length})</Text>
      <Text style={styles.hint}>
        Native startup entries are retained natively until the callback is first
        enabled; more arrive when the app goes to the background (warn) and
        returns (info).
      </Text>
      <View style={styles.list} testID="received-list">
        {received.map((e, i) => (
          <Text
            key={`${e.timestamp}-${i}`}
            style={[styles.mono, levelStyle[e.level]]}
          >
            {new Date(e.timestamp).toLocaleTimeString()} {e.source.padEnd(7)}{' '}
            {e.level.padEnd(5)} [{e.tag}] {e.message}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

function Btn({
  label,
  onPress,
  active,
  testID,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        active && styles.btnActive,
        pressed && styles.btnPressed,
      ]}
    >
      <Text style={[styles.btnText, active && styles.btnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const levelStyle = StyleSheet.create({
  debug: { color: '#888' },
  info: { color: '#1b6ac9' },
  warn: { color: '#b8860b' },
  error: { color: '#c0392b' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f6f8' },
  h1: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  h2: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
    color: '#333',
  },
  hint: { fontSize: 12, color: '#666', marginBottom: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e6e6ec',
  },
  btnActive: { backgroundColor: '#1b6ac9' },
  btnPressed: { opacity: 0.6 },
  btnText: { fontSize: 14, color: '#111' },
  btnTextActive: { color: '#fff' },
  mono: { fontFamily: 'Menlo', fontSize: 11, marginTop: 8, color: '#222' },
  list: { marginTop: 4 },
});

export default App;
