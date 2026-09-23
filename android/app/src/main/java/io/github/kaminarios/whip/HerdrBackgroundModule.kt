package io.github.kaminarios.whip

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.math.sqrt

class HerdrBackgroundModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), SensorEventListener {
  private val sensorManager = context.getSystemService(SensorManager::class.java)
  private val notificationManager = context.getSystemService(NotificationManager::class.java)
  private val keyguardManager = context.getSystemService(KeyguardManager::class.java)
  private val powerManager = context.getSystemService(PowerManager::class.java)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val postedAgentNotificationIdentifiers = mutableSetOf<String>()
  @Volatile private var deviceLocked = keyguardManager.isKeyguardLocked || !powerManager.isInteractive
  private var lockStateReceiverRegistered = false
  private val lockStateReceiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context?, intent: Intent?) {
      val locked = when (intent?.action) {
        Intent.ACTION_SCREEN_OFF -> true
        Intent.ACTION_SCREEN_ON -> keyguardManager.isKeyguardLocked
        Intent.ACTION_USER_PRESENT -> false
        else -> return
      }
      updateDeviceLockState(locked)
    }
  }
  private var activeAlertIdentifier: String? = null
  private var activeAlertChannelId: String? = null
  private var mediaPlayer: MediaPlayer? = null
  private var lastShakeAtMs = 0L
  private val startSoundRunnable = Runnable { startLoopingSound() }
  private val stopAlertRunnable = Runnable { stopPersistentAlert("Agent alert timed out") }
  private val notificationWatchRunnable = object : Runnable {
    override fun run() {
      val identifier = activeAlertIdentifier ?: return
      if (notificationManager.activeNotifications.any { it.tag == identifier }) {
        mainHandler.postDelayed(this, NOTIFICATION_CHECK_INTERVAL_MS)
      } else {
        stopPersistentAlert("Agent notification was dismissed")
      }
    }
  }

  init {
    moduleInstance = this
    if (deviceLocked) pausedUntilForeground = true
    registerLockStateReceiver()
  }

  override fun getName(): String = "HerdrBackground"

  @ReactMethod
  fun getDeviceLockState(promise: Promise) {
    promise.resolve(deviceLocked)
  }

  @ReactMethod
  fun resumeMonitoringAfterUnlock(promise: Promise) {
    mainHandler.post {
      if (deviceLocked || keyguardManager.isKeyguardLocked || !powerManager.isInteractive) {
        promise.resolve(false)
      } else {
        pausedUntilForeground = false
        promise.resolve(true)
      }
    }
  }

  @ReactMethod
  fun updateHostStatus(sessionId: String, state: String, signal: String) {
    // Kept for bridge compatibility; the monitoring notification is static.
  }

  @ReactMethod
  fun removeHostStatus(sessionId: String) {
    // Kept for bridge compatibility; the monitoring notification is static.
  }

  @ReactMethod
  fun postAgentNotification(
    notificationIdentifier: String,
    title: String,
    body: String,
    channelId: String,
    hostId: String,
    paneId: String,
    delivery: String,
    promise: Promise,
  ) {
    mainHandler.post {
      try {
        if (deviceLocked || pausedUntilForeground) {
          promise.resolve(null)
          return@post
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
          !notificationManager.areNotificationsEnabled()
        ) {
          throw IllegalStateException("Whip notifications are disabled")
        }
        ensureAgentNotificationChannel(channelId, delivery)
        val launchIntent = Intent(context, MainActivity::class.java).apply {
          action = ACTION_OPEN_AGENT_NOTIFICATION
          putExtra(EXTRA_AGENT_NOTIFICATION_ID, notificationIdentifier)
          putExtra(EXTRA_AGENT_HOST_ID, hostId)
          putExtra(EXTRA_AGENT_PANE_ID, paneId)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val pendingIntent = PendingIntent.getActivity(
          context,
          notificationIdentifier.hashCode(),
          launchIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Notification.Builder(context, channelId)
        } else {
          @Suppress("DEPRECATION")
          Notification.Builder(context).setPriority(
            if (delivery == "regular") Notification.PRIORITY_DEFAULT else Notification.PRIORITY_MAX,
          )
        }
        builder
          .setSmallIcon(R.drawable.ic_notification_whip)
          .setContentTitle(title)
          .setContentText(body)
          .setContentIntent(pendingIntent)
          // Keep actionable Agent alerts out of Android's automatic app-level
          // notification group. Tapping that synthetic summary only launches
          // the launcher intent and drops the pane payload.
          .setGroup(AGENT_NOTIFICATION_GROUP)
          .setAutoCancel(true)
          .setOnlyAlertOnce(true)
          .setCategory(Notification.CATEGORY_MESSAGE)
        if (delivery != "regular") {
          builder
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setVibrate(ALERT_VIBRATION_PATTERN)
            .setPriority(Notification.PRIORITY_MAX)
        }
        notificationManager.notify(notificationIdentifier, EXPO_NOTIFICATION_ID, builder.build())
        postedAgentNotificationIdentifiers.add(notificationIdentifier)
        Log.i(TAG, "Agent notification posted natively in background")
        promise.resolve(null)
      } catch (error: Throwable) {
        Log.e(TAG, "Native background Agent notification failed", error)
        promise.reject("E_AGENT_NOTIFICATION_POST", error)
      }
    }
  }

  @ReactMethod
  fun dismissAgentNotification(notificationIdentifier: String, promise: Promise) {
    mainHandler.post {
      try {
        notificationManager.cancel(notificationIdentifier, EXPO_NOTIFICATION_ID)
        postedAgentNotificationIdentifiers.remove(notificationIdentifier)
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("E_AGENT_NOTIFICATION_DISMISS", error)
      }
    }
  }

  @ReactMethod
  fun getInitialAgentNotificationTarget(promise: Promise) {
    val target = synchronized(agentNotificationLock) {
      val value = pendingAgentNotificationTarget
      pendingAgentNotificationTarget = null
      value
    }
    promise.resolve(target?.toMap())
  }

  @ReactMethod
  fun start(hostCount: Double, powerMode: String, promise: Promise) {
    try {
      if (deviceLocked || pausedUntilForeground) {
        context.stopService(Intent(context, HerdrBackgroundService::class.java))
        promise.resolve(null)
        return
      }
      val intent = Intent(context, HerdrBackgroundService::class.java).apply {
        action = HerdrBackgroundService.ACTION_START
        putExtra(HerdrBackgroundService.EXTRA_HOST_COUNT, hostCount.toInt().coerceAtLeast(1))
        putExtra(HerdrBackgroundService.EXTRA_POWER_MODE, powerMode)
        putExtra(HerdrBackgroundService.EXTRA_MONITORING_REQUEST, true)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("E_BACKGROUND_MONITORING_START", error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      context.stopService(Intent(context, HerdrBackgroundService::class.java))
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("E_BACKGROUND_MONITORING_STOP", error)
    }
  }

  @ReactMethod
  fun armPersistentAlert(
    notificationIdentifier: String,
    channelId: String,
    timeoutMs: Double,
    promise: Promise,
  ) {
    mainHandler.post {
      try {
        if (deviceLocked || pausedUntilForeground) {
          stopPersistentAlert()
          promise.resolve(null)
          return@post
        }
        val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
          ?: throw IllegalStateException("This device has no accelerometer")
        stopPersistentAlert()
        activeAlertIdentifier = notificationIdentifier
        activeAlertChannelId = channelId
        lastShakeAtMs = 0L
        val registered = sensorManager.registerListener(
          this,
          accelerometer,
          SensorManager.SENSOR_DELAY_GAME,
          mainHandler,
        )
        if (!registered) throw IllegalStateException("Could not start accelerometer listener")
        mainHandler.postDelayed(startSoundRunnable, SOUND_START_DELAY_MS)
        mainHandler.postDelayed(notificationWatchRunnable, NOTIFICATION_POST_GRACE_MS)
        mainHandler.postDelayed(
          stopAlertRunnable,
          timeoutMs.toLong().coerceIn(MIN_ALERT_WINDOW_MS, MAX_ALERT_WINDOW_MS),
        )
        promise.resolve(null)
      } catch (error: Throwable) {
        stopPersistentAlert()
        promise.reject("E_PERSISTENT_ALERT_ARM", error)
      }
    }
  }

  @ReactMethod
  fun dismissPersistentAlert(promise: Promise) {
    mainHandler.post {
      try {
        activeAlertIdentifier?.let { identifier ->
          notificationManager.cancel(identifier, EXPO_NOTIFICATION_ID)
        }
        cancelVibration()
        stopPersistentAlert("App returned to the foreground")
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("E_PERSISTENT_ALERT_DISMISS", error)
      }
    }
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return
    val x = event.values[0] / SensorManager.GRAVITY_EARTH
    val y = event.values[1] / SensorManager.GRAVITY_EARTH
    val z = event.values[2] / SensorManager.GRAVITY_EARTH
    val gravityForce = sqrt(x * x + y * y + z * z)
    val now = SystemClock.elapsedRealtime()
    if (gravityForce < SHAKE_GRAVITY_THRESHOLD || now - lastShakeAtMs < SHAKE_SLOP_MS) return
    lastShakeAtMs = now

    val identifier = activeAlertIdentifier ?: return
    notificationManager.cancel(identifier, EXPO_NOTIFICATION_ID)
    cancelVibration()
    stopPersistentAlert("Shake detected; stopped agent alert $identifier")
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  override fun invalidate() {
    mainHandler.post {
      stopPersistentAlert()
    }
    if (lockStateReceiverRegistered) {
      try {
        context.unregisterReceiver(lockStateReceiver)
      } catch (_: IllegalArgumentException) {
        // The receiver may already have been unregistered during shutdown.
      }
      lockStateReceiverRegistered = false
    }
    if (moduleInstance === this) moduleInstance = null
    super.invalidate()
  }

  private fun registerLockStateReceiver() {
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(lockStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(lockStateReceiver, filter)
    }
    lockStateReceiverRegistered = true
  }

  private fun updateDeviceLockState(locked: Boolean) {
    val changed = deviceLocked != locked
    deviceLocked = locked
    if (!locked) {
      if (changed) emitDeviceLockState(false)
      return
    }

    pausedUntilForeground = true

    // Suppress alerts in native code as soon as Android turns the screen off,
    // even if the JavaScript runtime is already suspended in the background.
    stopPersistentAlert("Device locked; stopping Agent alerts")
    postedAgentNotificationIdentifiers.toList().forEach { identifier ->
      notificationManager.cancel(identifier, EXPO_NOTIFICATION_ID)
    }
    postedAgentNotificationIdentifiers.clear()
    cancelVibration()
    context.stopService(Intent(context, HerdrBackgroundService::class.java))
    if (changed) emitDeviceLockState(true)
  }

  private fun emitDeviceLockState(locked: Boolean) {
    try {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(DEVICE_LOCK_STATE_CHANGED_EVENT, locked)
    } catch (error: Throwable) {
      Log.w(TAG, "Could not deliver device lock state to JavaScript", error)
    }
  }

  private fun ensureAgentNotificationChannel(channelId: String, delivery: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (notificationManager.getNotificationChannel(channelId) != null) return
    val regular = delivery == "regular"
    val channel = NotificationChannel(
      channelId,
      context.getString(if (regular) R.string.herdr_agent_regular_channel else R.string.herdr_agent_channel),
      if (regular) NotificationManager.IMPORTANCE_DEFAULT else NotificationManager.IMPORTANCE_HIGH,
    )
    if (!regular) {
      channel.enableVibration(true)
      channel.vibrationPattern = ALERT_VIBRATION_PATTERN
      channel.setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
          .build(),
      )
    }
    notificationManager.createNotificationChannel(channel)
  }

  private data class AgentNotificationTarget(
    val notificationId: String,
    val hostId: String,
    val paneId: String,
  ) {
    fun toMap() = Arguments.createMap().apply {
      putString("notificationId", notificationId)
      putString("hostId", hostId)
      putString("paneId", paneId)
    }
  }

  private fun emitAgentNotificationTarget(target: AgentNotificationTarget) {
    try {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(AGENT_NOTIFICATION_TAPPED_EVENT, target.toMap())
    } catch (error: Throwable) {
      Log.w(TAG, "Could not deliver Agent notification tap to JavaScript", error)
    }
  }

  private fun startLoopingSound() {
    if (deviceLocked || pausedUntilForeground) return
    val channelId = activeAlertChannelId ?: return
    val sound = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      notificationManager.getNotificationChannel(channelId)?.sound
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    }
    if (sound == null) {
      Log.i(TAG, "Agent alert channel is muted; persistent sound not started")
      return
    }
    val audioManager = context.getSystemService(AudioManager::class.java)
    val privateListeningDevice = findPrivateListeningDevice(audioManager)
    val streamType = if (privateListeningDevice != null) {
      AudioManager.STREAM_MUSIC
    } else {
      AudioManager.STREAM_ALARM
    }
    if (audioManager.getStreamVolume(streamType) == 0) {
      Log.i(TAG, "Agent alert volume is zero; persistent sound not started")
      return
    }
    try {
      mediaPlayer = MediaPlayer().apply {
        setDataSource(context, sound)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(
              if (privateListeningDevice != null) {
                AudioAttributes.USAGE_MEDIA
              } else {
                AudioAttributes.USAGE_ALARM
              },
            )
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          privateListeningDevice?.let { device ->
            if (!setPreferredDevice(device)) {
              Log.w(TAG, "Could not select the connected private audio device")
            }
          }
        }
        isLooping = true
        prepare()
        start()
      }
      Log.i(
        TAG,
        if (privateListeningDevice != null) {
          "Persistent agent alert sound started on private audio device"
        } else {
          "Persistent agent alert sound started on alarm route"
        },
      )
    } catch (error: Throwable) {
      Log.w(TAG, "Could not start persistent agent alert sound", error)
      releaseMediaPlayer()
    }
  }

  private fun findPrivateListeningDevice(audioManager: AudioManager): AudioDeviceInfo? =
    audioManager
      .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      .firstOrNull { device ->
        when (device.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
          AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_HEARING_AID -> true
          else ->
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
              device.type == AudioDeviceInfo.TYPE_USB_HEADSET) ||
              (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                device.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
        }
      }

  private fun stopPersistentAlert(reason: String? = null) {
    mainHandler.removeCallbacks(startSoundRunnable)
    mainHandler.removeCallbacks(stopAlertRunnable)
    mainHandler.removeCallbacks(notificationWatchRunnable)
    sensorManager.unregisterListener(this)
    activeAlertIdentifier = null
    activeAlertChannelId = null
    releaseMediaPlayer()
    reason?.let { Log.i(TAG, it) }
  }

  private fun releaseMediaPlayer() {
    mediaPlayer?.let { player ->
      try {
        player.stop()
      } catch (_: IllegalStateException) {
        // The player may not have reached its prepared state.
      }
      player.release()
    }
    mediaPlayer = null
  }

  @Suppress("DEPRECATION")
  private fun cancelVibration() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java).defaultVibrator.cancel()
    } else {
      (context.getSystemService(Vibrator::class.java)).cancel()
    }
  }

  companion object {
    private const val TAG = "HerdrPersistentAlert"
    private const val EXPO_NOTIFICATION_ID = 0
    private const val AGENT_NOTIFICATION_GROUP = "agent-notifications"
    private val ALERT_VIBRATION_PATTERN = longArrayOf(300, 100, 300, 100, 300, 100, 300, 2000)
    const val ACTION_OPEN_AGENT_NOTIFICATION = "io.github.kaminarios.whip.OPEN_AGENT_NOTIFICATION"
    const val EXTRA_AGENT_NOTIFICATION_ID = "agent_notification_id"
    const val EXTRA_AGENT_HOST_ID = "agent_host_id"
    const val EXTRA_AGENT_PANE_ID = "agent_pane_id"
    const val AGENT_NOTIFICATION_TAPPED_EVENT = "WhipAgentNotificationTapped"
    const val DEVICE_LOCK_STATE_CHANGED_EVENT = "WhipDeviceLockStateChanged"
    private val agentNotificationLock = Any()
    private var pendingAgentNotificationTarget: AgentNotificationTarget? = null
    private var moduleInstance: HerdrBackgroundModule? = null
    @Volatile private var pausedUntilForeground = false

    fun isMonitoringPaused(): Boolean = pausedUntilForeground

    fun handleAgentNotificationIntent(intent: Intent?) {
      if (intent?.action != ACTION_OPEN_AGENT_NOTIFICATION) return
      val target = AgentNotificationTarget(
        notificationId = intent.getStringExtra(EXTRA_AGENT_NOTIFICATION_ID) ?: return,
        hostId = intent.getStringExtra(EXTRA_AGENT_HOST_ID) ?: return,
        paneId = intent.getStringExtra(EXTRA_AGENT_PANE_ID) ?: return,
      )
      synchronized(agentNotificationLock) {
        pendingAgentNotificationTarget = target
      }
      moduleInstance?.emitAgentNotificationTarget(target)
    }
    private const val SHAKE_GRAVITY_THRESHOLD = 2.7f
    private const val SHAKE_SLOP_MS = 750L
    private const val SOUND_START_DELAY_MS = 800L
    private const val NOTIFICATION_POST_GRACE_MS = 1_500L
    private const val NOTIFICATION_CHECK_INTERVAL_MS = 300L
    private const val MIN_ALERT_WINDOW_MS = 1_000L
    private const val MAX_ALERT_WINDOW_MS = 60_000L
  }
}
