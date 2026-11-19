// Private. Process-wide state shared by the public API (RNUnifiedLogger) and
// the Turbo Module (RNUnifiedLoggerModule). Not part of the public headers.

#import <Foundation/Foundation.h>

#import "RNUnifiedLogger.h"

NS_ASSUME_NONNULL_BEGIN

/// Receiver for forwarded entries. Implemented by the codegen'd
/// NativeUnifiedLoggerSpecBase, which RNUnifiedLoggerModule inherits from.
@protocol RNUnifiedLoggerEventSink <NSObject>
- (void)emitOnLog:(NSDictionary *)value;
@end

@interface RNUnifiedLoggerCore : NSObject

+ (instancetype)sharedInstance;

/// Native-originated entry: filter, write to os_log, forward or buffer.
- (void)logLevel:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message;

/// JS-originated entry: write to os_log only (never filtered, buffered or emitted).
- (void)writeToSystemLog:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message;

/// Applies settings from JS, then flushes (forwardToJs) or clears the buffer.
/// `sink` is the module that received the call; its JS event emitter is
/// guaranteed to be installed by now.
- (void)configureWithForwardToJs:(BOOL)forwardToJs
                      logLocally:(BOOL)logLocally
                        minLevel:(RNULogLevel)minLevel
                            sink:(id<RNUnifiedLoggerEventSink>)sink;

/// Records `sink` as the live module instance (held weakly).
- (void)registerSink:(id<RNUnifiedLoggerEventSink>)sink;

/// Forgets `sink` if it is the live instance; later entries buffer again.
- (void)unregisterSink:(id<RNUnifiedLoggerEventSink>)sink;

- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
