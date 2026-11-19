import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * A log entry that originated in native code (Objective-C/Swift on iOS,
 * Kotlin/Java on Android) and is being forwarded to JavaScript.
 */
export type NativeLogEntry = {
  /** Numeric level: 0 = debug, 1 = info, 2 = warn, 3 = error. */
  level: number;
  tag: string;
  message: string;
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  /** 'ios' or 'android'. */
  source: string;
};

export type NativeConfig = {
  /** Forward native-originated entries to JS via the onLog event. */
  forwardToJs: boolean;
  /** Write native-originated entries to the platform log (os_log / logcat). */
  logLocally: boolean;
  /** Drop native-originated entries below this level (0..3). */
  minLevel: number;
};

export interface Spec extends TurboModule {
  /** Apply routing configuration. Also flushes any entries buffered before JS was ready. */
  configure(config: NativeConfig): void;
  /** Write a JS-originated entry to the platform log (os_log / logcat) with a real tag and level. */
  log(level: number, tag: string, message: string): void;
  /** Emitted for native-originated entries when forwardToJs is enabled. */
  readonly onLog: CodegenTypes.EventEmitter<NativeLogEntry>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('UnifiedLogger');
