#import "AppDelegate.h"

#import <Firebase.h>
#import <RNVoipPushNotificationManager.h>
#import <React/RCTLog.h>

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // 🍎 Sync Registration for VoIP and standard APNs
  self.voipRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
  self.voipRegistry.delegate = self;
  self.voipRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
  
  // Also force standard APNs registration
  [application registerForRemoteNotifications];
  
  RCTLogInfo(@"🍎 [AppDelegate] PushKit & APNs Registration triggered synchronously");

  [FIRApp configure];
  
  // Set the notification delegate to self (AppDelegate)
  [UNUserNotificationCenter currentNotificationCenter].delegate = self;
  
  self.moduleName = @"FlyConnect";
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

// ── APNs Token Registration ──
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  RCTLogInfo(@"📡 [AppDelegate] APNs Token Registered");
  [FIRMessaging messaging].APNSToken = deviceToken;
}

- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  RCTLogError(@"❌ [AppDelegate] Failed to register for remote notifications: %@", error.localizedDescription);
}

// ── Remote Notification Received ──
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler {
  NSLog(@"📩 [AppDelegate] Remote Notification Received");
  [[FIRMessaging messaging] appDidReceiveMessage:userInfo];
  completionHandler(UIBackgroundFetchResultNewData);
}

// ── Foreground Notification Handling ──
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  NSDictionary *userInfo = notification.request.content.userInfo;
  NSString *type = userInfo[@"type"];
  
  if ([type isEqualToString:@"CALL_INCOMING"]) {
    completionHandler(UNNotificationPresentationOptionNone);
  } else {
    completionHandler(UNNotificationPresentationOptionSound | UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionBadge);
  }
}

// ── PushKit (VoIP) Delegate Methods ──
- (void)pushRegistry:(PKPushRegistry *)registry didUpdatePushCredentials:(PKPushCredentials *)credentials forType:(PKPushType)type {
  const unsigned char *dataBuffer = (const unsigned char *)credentials.token.bytes;
  NSUInteger          dataLength  = credentials.token.length;
  NSMutableString     *hexToken   = [NSMutableString stringWithCapacity:(dataLength * 2)];

  for (int i = 0; i < dataLength; ++i) {
    [hexToken appendFormat:@"%02x", (unsigned int)dataBuffer[i]];
  }
  
  NSString *token = [hexToken uppercaseString];
  RCTLogInfo(@"🔑 [AppDelegate] ✅ VoIP Token Generated: %@", token);
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:type];
}

- (void)pushRegistry:(PKPushRegistry *)registry didReceiveIncomingPushWithPayload:(PKPushPayload *)payload forType:(PKPushType)type withCompletionHandler:(void (^)(void))completion {
  RCTLogInfo(@"📞 [AppDelegate] 🔔 HIGH PRIORITY: Incoming VoIP Push Received: %@", payload.dictionaryPayload);
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:type];
  if (completion) {
    completion();
  }
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
