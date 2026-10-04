package com.flyconnect

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PipModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "PipModule"
    private var reactAppContext: ReactApplicationContext? = null

    fun sendPipModeChanged(isInPipMode: Boolean) {
      reactAppContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("onPipModeChanged", isInPipMode)
    }
  }

  init {
    reactAppContext = reactContext
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun isPipSupported(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val supported = reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
      promise.resolve(supported)
    } else {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun setAutoPipEnabled(enabled: Boolean, promise: Promise) {
    MainActivity.isPipEnabled = enabled
    promise.resolve(true)
  }

  @ReactMethod
  fun enterPip(aspectRatioX: Int, aspectRatioY: Int, promise: Promise) {
    val activity: Activity? = currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_NULL", "Current activity is null")
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val num = if (aspectRatioX > 0) aspectRatioX else 9
        val den = if (aspectRatioY > 0) aspectRatioY else 16
        val ratio = Rational(num, den)
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(ratio)
          .build()
        val success = activity.enterPictureInPictureMode(params)
        promise.resolve(success)
      } catch (e: Exception) {
        promise.reject("PIP_ERROR", e.message, e)
      }
    } else {
      promise.reject("PIP_UNSUPPORTED", "Picture in Picture requires Android 8.0 or higher")
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for React Native built-in event emitter
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required for React Native built-in event emitter
  }
}
