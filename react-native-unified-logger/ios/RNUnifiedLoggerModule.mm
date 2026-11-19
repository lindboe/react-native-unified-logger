#import "RNUnifiedLoggerModule.h"

#include <algorithm>
#include <cmath>

// Converts a JS number to a level: clamped to 0...3, non-finite becomes debug.
static RNULogLevel RNULevelFromJS(double value)
{
  if (!std::isfinite(value)) {
    return RNULogLevelDebug;
  }
  return (RNULogLevel)(NSInteger)std::clamp(value, 0.0, 3.0);
}

@implementation RNUnifiedLoggerModule

RCT_EXPORT_MODULE(UnifiedLogger)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    [[RNUnifiedLoggerCore sharedInstance] registerSink:self];
  }
  return self;
}

- (void)invalidate
{
  [[RNUnifiedLoggerCore sharedInstance] unregisterSink:self];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeUnifiedLoggerSpecJSI>(params);
}

#pragma mark - NativeUnifiedLoggerSpec

- (void)configure:(JS::NativeUnifiedLogger::NativeConfig &)config
{
  [[RNUnifiedLoggerCore sharedInstance] configureWithForwardToJs:config.forwardToJs()
                                                      logLocally:config.logLocally()
                                                        minLevel:RNULevelFromJS(config.minLevel())
                                                            sink:self];
}

- (void)log:(double)level tag:(NSString *)tag message:(NSString *)message
{
  [[RNUnifiedLoggerCore sharedInstance] writeToSystemLog:RNULevelFromJS(level) tag:tag message:message];
}

@end
