// Public native logging API for react-native-unified-logger.
//
// Pure Objective-C (no C++ or React headers), so it can be imported from any
// Objective-C file (#import <RNUnifiedLogger/RNUnifiedLogger.h>) or from Swift
// (import RNUnifiedLogger, or via a bridging header).
//
// Entries are filtered by the configured minimum level, written to os_log
// (subsystem = main bundle identifier, category = tag) when local logging is
// enabled, and forwarded to JavaScript's onLog listener when forwarding is
// enabled. Entries logged before JavaScript has configured the logger are
// buffered (up to 500, oldest dropped first). All methods are thread-safe.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Log severity. Raw values match the numeric levels used in JavaScript.
typedef NS_ENUM(NSInteger, RNULogLevel) {
  RNULogLevelDebug = 0,
  RNULogLevelInfo = 1,
  RNULogLevelWarn = 2,
  RNULogLevelError = 3,
} NS_SWIFT_NAME(UnifiedLogLevel);

NS_SWIFT_NAME(UnifiedLogger)
@interface RNUnifiedLogger : NSObject

/// Logs `message` at `level` under `tag` (used as the os_log category).
/// Swift: `UnifiedLogger.log(.info, tag: "Net", message: "...")`
+ (void)log:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message
    NS_SWIFT_NAME(log(_:tag:message:));

/// Logs at debug level. Swift: `UnifiedLogger.debug(tag:message:)`
+ (void)debug:(NSString *)tag message:(NSString *)message NS_SWIFT_NAME(debug(tag:message:));

/// Logs at info level. Swift: `UnifiedLogger.info(tag:message:)`
+ (void)info:(NSString *)tag message:(NSString *)message NS_SWIFT_NAME(info(tag:message:));

/// Logs at warn level. Swift: `UnifiedLogger.warn(tag:message:)`
+ (void)warn:(NSString *)tag message:(NSString *)message NS_SWIFT_NAME(warn(tag:message:));

/// Logs at error level. Swift: `UnifiedLogger.error(tag:message:)`
+ (void)error:(NSString *)tag message:(NSString *)message NS_SWIFT_NAME(error(tag:message:));

// printf-style variants (Objective-C only; Swift does not import C variadic
// methods, so use string interpolation with the methods above).

/// Formats the message with `format` and logs it at `level`.
+ (void)log:(RNULogLevel)level tag:(NSString *)tag format:(NSString *)format, ...
    NS_FORMAT_FUNCTION(3, 4) NS_SWIFT_UNAVAILABLE("Use log(_:tag:message:)");

/// Formats the message with `format` and logs it at debug level.
+ (void)debug:(NSString *)tag format:(NSString *)format, ...
    NS_FORMAT_FUNCTION(2, 3) NS_SWIFT_UNAVAILABLE("Use debug(tag:message:)");

/// Formats the message with `format` and logs it at info level.
+ (void)info:(NSString *)tag format:(NSString *)format, ...
    NS_FORMAT_FUNCTION(2, 3) NS_SWIFT_UNAVAILABLE("Use info(tag:message:)");

/// Formats the message with `format` and logs it at warn level.
+ (void)warn:(NSString *)tag format:(NSString *)format, ...
    NS_FORMAT_FUNCTION(2, 3) NS_SWIFT_UNAVAILABLE("Use warn(tag:message:)");

/// Formats the message with `format` and logs it at error level.
+ (void)error:(NSString *)tag format:(NSString *)format, ...
    NS_FORMAT_FUNCTION(2, 3) NS_SWIFT_UNAVAILABLE("Use error(tag:message:)");

- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
