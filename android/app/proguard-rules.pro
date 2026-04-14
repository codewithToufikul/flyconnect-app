# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native
-keep public class com.facebook.react.bridge.ProxyJavaScriptExecutor { *; }
-keep public class com.facebook.react.bridge.CatalystInstanceImpl { *; }
-keep class com.facebook.react.bridge.WritableNativeMap { *; }
-keep class com.facebook.react.bridge.ReadableNativeMap { *; }

# Firebase Messaging
-keep class com.google.firebase.messaging.** { *; }
-keep public class com.google.firebase.iid.FirebaseInstanceId { *; }
-keep public class com.google.firebase.iid.FirebaseInstanceIdService { *; }

# Notifee
-keep class io.invertase.notifee.** { *; }

# CallKeep
-keep class io.wazo.callkeep.** { *; }

# Agora
-keep class io.agora.** { *; }
-dontwarn io.agora.**

# Socket.io & OkHttp
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn io.socket.**
-dontwarn okhttp3.**
-dontwarn okio.**

# React Native Video (v6+)
-keep class com.brentvatne.react.** { *; }
-keep class com.brentvatne.common.** { *; }
-keep class com.brentvatne.exoplayer.** { *; }
-keep class com.google.android.exoplayer2.** { *; }
-dontwarn com.brentvatne.**

# Image Picker
-keep class com.reactnative.ivpusic.imagepicker.** { *; }

# Keychain
-keep class com.oblador.keychain.** { *; }

# Permissions
-keep class com.zoontek.rnpermissions.** { *; }

# Nitro Modules (Margelo)
-keep class com.margelo.nitro.** { *; }
-keep interface com.margelo.nitro.** { *; }
-dontwarn com.margelo.nitro.**

# Audio Recorder Player (Nitro implementation)
-keep class com.dooboolab.audiorecorderplayer.** { *; }
-keep class com.margelo.nitro.audiorecorderplayer.** { *; }
-dontwarn com.dooboolab.audiorecorderplayer.**
-dontwarn com.margelo.nitro.audiorecorderplayer.**

# Geolocation
-keep class com.agontuk.RNGeolocation.** { *; }

# SVG
-keep class com.horcrux.svg.** { *; }

# Agora & react-native-agora
-keep class io.agora.** { *; }
-keep class io.agora.rtc.** { *; }
-keep class io.agora.rtc2.** { *; }
-keep class io.agora.rtc2.internal.** { *; }
-keep class io.agora.base.** { *; }
-keep class com.agorareactnative.** { *; }
-dontwarn io.agora.**
-dontwarn com.agorareactnative.**

# Audio / Video processing
-keep class com.sun.** { *; }
-keep class org.slf4j.** { *; }

# CallKeep
-keep class io.wazo.callkeep.** { *; }
-dontwarn io.wazo.callkeep.**
-keep class io.wazo.callkeep.VoiceConnectionService { *; }
-keep class io.wazo.callkeep.RNCallKeepBackgroundMessagingService { *; }

# Generic attributes for libraries using reflection
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses, EnclosingMethod
-dontwarn sun.misc.**
-dontwarn javax.annotation.**

# Reanimated v3
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-dontwarn com.swmansion.reanimated.**

# React Native Screens
-keep class com.swmansion.rnscreens.** { *; }
-dontwarn com.swmansion.rnscreens.**

# Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }
-dontwarn com.swmansion.gesturehandler.**

# New Architecture / JSI / TurboModules
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.queue.NativeRunnable { *; }
-keep class com.facebook.react.uimanager.ViewManager { *; }
-keep class com.facebook.react.views.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.soloader.** { *; }
-dontwarn com.facebook.react.bridge.queue.NativeRunnable
-dontwarn com.facebook.jni.**

