#import "RNUnifiedLogger.h"

#import "RNUnifiedLoggerCore.h"

// Formats the variadic arguments that follow `format` and logs the result.
#define RNU_LOG_FORMAT(LEVEL, TAG, FORMAT)                                       \
  do {                                                                           \
    va_list args;                                                                \
    va_start(args, FORMAT);                                                      \
    NSString *message = [[NSString alloc] initWithFormat:FORMAT arguments:args]; \
    va_end(args);                                                                \
    [[RNUnifiedLoggerCore sharedInstance] logLevel:(LEVEL) tag:(TAG) message:message]; \
  } while (0)

@implementation RNUnifiedLogger

+ (void)log:(RNULogLevel)level tag:(NSString *)tag message:(NSString *)message
{
  [[RNUnifiedLoggerCore sharedInstance] logLevel:level tag:tag message:message];
}

+ (void)debug:(NSString *)tag message:(NSString *)message
{
  [self log:RNULogLevelDebug tag:tag message:message];
}

+ (void)info:(NSString *)tag message:(NSString *)message
{
  [self log:RNULogLevelInfo tag:tag message:message];
}

+ (void)warn:(NSString *)tag message:(NSString *)message
{
  [self log:RNULogLevelWarn tag:tag message:message];
}

+ (void)error:(NSString *)tag message:(NSString *)message
{
  [self log:RNULogLevelError tag:tag message:message];
}

+ (void)log:(RNULogLevel)level tag:(NSString *)tag format:(NSString *)format, ...
{
  RNU_LOG_FORMAT(level, tag, format);
}

+ (void)debug:(NSString *)tag format:(NSString *)format, ...
{
  RNU_LOG_FORMAT(RNULogLevelDebug, tag, format);
}

+ (void)info:(NSString *)tag format:(NSString *)format, ...
{
  RNU_LOG_FORMAT(RNULogLevelInfo, tag, format);
}

+ (void)warn:(NSString *)tag format:(NSString *)format, ...
{
  RNU_LOG_FORMAT(RNULogLevelWarn, tag, format);
}

+ (void)error:(NSString *)tag format:(NSString *)format, ...
{
  RNU_LOG_FORMAT(RNULogLevelError, tag, format);
}

@end
