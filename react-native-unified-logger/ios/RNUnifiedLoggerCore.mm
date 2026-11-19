#import "RNUnifiedLoggerCore.h"

#import <os/lock.h>
#import <os/log.h>

static const NSUInteger kRNUMaxBufferedEntries = 500;

static os_log_type_t RNUOSLogType(RNULogLevel level)
{
  switch (level) {
    case RNULogLevelDebug:
      return OS_LOG_TYPE_DEBUG;
    case RNULogLevelInfo:
      return OS_LOG_TYPE_INFO;
    case RNULogLevelWarn:
      return OS_LOG_TYPE_DEFAULT;
    case RNULogLevelError:
      return OS_LOG_TYPE_ERROR;
  }
  return OS_LOG_TYPE_DEFAULT;
}

static RNULogLevel RNUClampLevel(RNULogLevel level)
{
  return MAX(RNULogLevelDebug, MIN(RNULogLevelError, level));
}

@implementation RNUnifiedLoggerCore {
  // Guards every ivar below. Never held while calling os_log.
  os_unfair_lock _lock;

  BOOL _forwardToJs;
  BOOL _logLocally;
  RNULogLevel _minLevel;
  /// YES once the app has called configure on the live JS runtime. Until then
  /// (process start, or a JS reload) entries are retained, bounded, so that a
  /// callback enabled later still receives them.
  BOOL _configured;
  /// The live module. Only emitted to after it has received configure, since
  /// codegen installs its JS emitter callback when JS first looks it up.
  __weak id<RNUnifiedLoggerEventSink> _sink;
  NSMutableArray<NSDictionary *> *_buffer;
  NSMutableDictionary<NSString *, os_log_t> *_logsByTag;
  NSString *_subsystem;
}

+ (instancetype)sharedInstance
{
  static RNUnifiedLoggerCore *instance;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    instance = [[self alloc] initPrivate];
  });
  return instance;
}

- (instancetype)initPrivate
{
  if (self = [super init]) {
    _lock = OS_UNFAIR_LOCK_INIT;
    _forwardToJs = NO;
    _logLocally = YES;
    _minLevel = RNULogLevelDebug;
    _buffer = [NSMutableArray new];
    _logsByTag = [NSMutableDictionary new];
    _subsystem = [NSBundle mainBundle].bundleIdentifier ?: @"react-native-unified-logger";
  }
  return self;
}

#pragma mark - Logging

- (void)logLevel:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message
{
  level = RNUClampLevel(level);
  tag = tag ?: @"";
  message = message ?: @"";

  os_unfair_lock_lock(&_lock);
  if (level < _minLevel) {
    os_unfair_lock_unlock(&_lock);
    return;
  }
  BOOL logLocally = _logLocally;
  os_log_t osLog = logLocally ? [self osLogForTagLocked:tag] : nil;

  if (_forwardToJs || !_configured) {
    NSDictionary *entry = @{
      @"level" : @(level),
      @"tag" : tag,
      @"message" : message,
      @"timestamp" : @([[NSDate date] timeIntervalSince1970] * 1000.0),
      @"source" : @"ios",
    };
    id<RNUnifiedLoggerEventSink> sink = _sink;
    if (_forwardToJs && _configured && sink) {
      // Emitted under the lock so entries reach JS in the order they were
      // logged (including relative to a flush). emitOnLog only schedules work
      // on the JS thread via the call invoker; it does not call back into us.
      [sink emitOnLog:entry];
    } else {
      // The app has not configured this runtime yet (startup or reload), or
      // forwarding is on but the module is gone: keep for later.
      [self appendToBufferLocked:entry];
    }
  }
  os_unfair_lock_unlock(&_lock);

  if (osLog) {
    os_log_with_type(osLog, RNUOSLogType(level), "%{public}@", message);
  }
}

- (void)writeToSystemLog:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message
{
  level = RNUClampLevel(level);
  os_unfair_lock_lock(&_lock);
  os_log_t osLog = [self osLogForTagLocked:tag ?: @""];
  os_unfair_lock_unlock(&_lock);
  os_log_with_type(osLog, RNUOSLogType(level), "%{public}@", message ?: @"");
}

#pragma mark - Module lifecycle

- (void)configureWithForwardToJs:(BOOL)forwardToJs
                      logLocally:(BOOL)logLocally
                        minLevel:(RNULogLevel)minLevel
                            sink:(id<RNUnifiedLoggerEventSink>)sink
{
  os_unfair_lock_lock(&_lock);
  _forwardToJs = forwardToJs;
  _logLocally = logLocally;
  _minLevel = RNUClampLevel(minLevel);
  _configured = YES;
  _sink = sink;
  if (forwardToJs) {
    for (NSDictionary *entry in _buffer) {
      [sink emitOnLog:entry];
    }
    [_buffer removeAllObjects];
  }
  // With forwarding off the buffer is kept (it is bounded). It holds entries
  // from before this runtime was configured; the next configure with
  // forwarding on delivers them.
  os_unfair_lock_unlock(&_lock);
}

- (void)registerSink:(id<RNUnifiedLoggerEventSink>)sink
{
  os_unfair_lock_lock(&_lock);
  _sink = sink;
  // A new module means a new JS runtime (e.g. reload): buffer until it
  // configures, because its emitter callback may not be installed yet.
  _configured = NO;
  os_unfair_lock_unlock(&_lock);
}

- (void)unregisterSink:(id<RNUnifiedLoggerEventSink>)sink
{
  os_unfair_lock_lock(&_lock);
  if (_sink == sink) {
    // Keep _configured and _forwardToJs: with forwarding on, entries buffer
    // again (no instance); with forwarding off, they are not buffered.
    _sink = nil;
  }
  os_unfair_lock_unlock(&_lock);
}

#pragma mark - Helpers (call with _lock held)

- (void)appendToBufferLocked:(NSDictionary *)entry
{
  if (_buffer.count >= kRNUMaxBufferedEntries) {
    [_buffer removeObjectAtIndex:0];
  }
  [_buffer addObject:entry];
}

- (os_log_t)osLogForTagLocked:(NSString *)tag
{
  os_log_t osLog = _logsByTag[tag];
  if (!osLog) {
    osLog = os_log_create(_subsystem.UTF8String, tag.UTF8String);
    _logsByTag[tag] = osLog;
  }
  return osLog;
}

@end
