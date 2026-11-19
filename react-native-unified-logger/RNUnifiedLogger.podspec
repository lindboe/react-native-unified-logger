require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNUnifiedLogger"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = package["description"]
  s.homepage     = package["homepage"] || "https://www.npmjs.com/package/#{package["name"]}"
  s.license      = package["license"]
  s.authors      = package["author"] || "react-native-unified-logger contributors"
  s.platforms    = min_supported_versions
  s.source       = { :git => (package.dig("repository", "url") || "").sub(/\Agit\+/, ""), :tag => "#{s.version}" }

  s.source_files        = "ios/**/*.{h,m,mm}"
  # Only the plain Objective-C logging API is public; the Turbo Module and the
  # core singleton stay private so app code never sees C++/React headers.
  s.public_header_files = "ios/RNUnifiedLogger.h"
  s.requires_arc        = true

  # Lets Swift app code `import RNUnifiedLogger` even with static linkage.
  # Must be set before install_modules_dependencies, which merges its own
  # settings (header paths, c++20, RCT_NEW_ARCH_ENABLED) into this hash.
  s.pod_target_xcconfig = { "DEFINES_MODULE" => "YES" }

  # Adds React Native, codegen (RNUnifiedLoggerSpec) and JSI dependencies.
  install_modules_dependencies(s)
end
