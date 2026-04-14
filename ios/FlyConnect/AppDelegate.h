#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>
#import <PushKit/PushKit.h>

@interface AppDelegate : RCTAppDelegate <UNUserNotificationCenterDelegate, PKPushRegistryDelegate>

@property (strong, nonatomic) PKPushRegistry *voipRegistry;

@end
