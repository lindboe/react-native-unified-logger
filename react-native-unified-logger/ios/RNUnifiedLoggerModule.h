// Private. The `UnifiedLogger` Turbo Module (Objective-C++; include only from .mm).

#import <React/RCTInvalidating.h>
#import <RNUnifiedLoggerSpec/RNUnifiedLoggerSpec.h>

#import "RNUnifiedLoggerCore.h"

NS_ASSUME_NONNULL_BEGIN

@interface RNUnifiedLoggerModule
    : NativeUnifiedLoggerSpecBase <NativeUnifiedLoggerSpec, RCTInvalidating, RNUnifiedLoggerEventSink>
@end

NS_ASSUME_NONNULL_END
