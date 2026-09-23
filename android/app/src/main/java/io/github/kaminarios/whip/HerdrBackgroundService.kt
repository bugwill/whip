package io.github.kaminarios.whip

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.KeyguardManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

class HerdrBackgroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var monitoringRequested = false
  private var requestedPowerMode = POWER_MODE_BALANCED
  private var foregroundStarted = false

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (
      HerdrBackgroundModule.isMonitoringPaused() ||
      getSystemService(KeyguardManager::class.java).isKeyguardLocked ||
      !getSystemService(PowerManager::class.java).isInteractive
    ) {
      monitoringRequested = false
      reconcileWakeLock()
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (intent?.action == ACTION_STOP_MONITORING) monitoringRequested = false
    if (intent?.getBooleanExtra(EXTRA_MONITORING_REQUEST, false) == true) {
      monitoringRequested = true
      requestedPowerMode = normalizePowerMode(intent.getStringExtra(EXTRA_POWER_MODE))
    }
    if (!monitoringRequested) {
      reconcileWakeLock()
      stopSelf(startId)
      return START_NOT_STICKY
    }
    reconcileWakeLock()
    promoteToForeground()
    // The React Native runtime owns the SSH monitor. Do not restart only the
    // notification after Android has killed the whole application process.
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.herdr_background_channel),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = getString(R.string.herdr_background_channel_description)
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun promoteToForeground() {
    if (foregroundStarted) return
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    foregroundStarted = true
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent(this, MainActivity::class.java)
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this).setPriority(Notification.PRIORITY_LOW)
    }
    return builder
      .setSmallIcon(R.drawable.ic_notification_whip)
      .setContentTitle(getString(R.string.herdr_background_title))
      .setContentText(getString(R.string.herdr_background_static))
      .setContentIntent(contentIntent)
      .setGroup(BACKGROUND_NOTIFICATION_GROUP)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .build()
  }

  @SuppressLint("WakelockTimeout")
  private fun reconcileWakeLock() {
    val shouldHold = monitoringRequested && requestedPowerMode == POWER_MODE_REALTIME
    if (!shouldHold) {
      releaseWakeLock()
      return
    }
    if (wakeLock?.isHeld == true) return
    val powerManager = getSystemService(PowerManager::class.java)
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "$packageName:herdr-monitoring",
    ).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun normalizePowerMode(value: String?): String =
    if (value == POWER_MODE_REALTIME) POWER_MODE_REALTIME else POWER_MODE_BALANCED

  companion object {
    const val ACTION_START = "io.github.kaminarios.whip.action.START_BACKGROUND_MONITORING"
    const val ACTION_STOP_MONITORING = "io.github.kaminarios.whip.action.STOP_BACKGROUND_MONITORING"
    const val EXTRA_HOST_COUNT = "host_count"
    const val EXTRA_POWER_MODE = "power_mode"
    const val EXTRA_MONITORING_REQUEST = "monitoring_request"
    const val POWER_MODE_BALANCED = "balanced"
    const val POWER_MODE_REALTIME = "realtime"
    private const val CHANNEL_ID = "herdr-background-monitoring"
    private const val BACKGROUND_NOTIFICATION_GROUP = "herdr-background-monitoring"
    private const val NOTIFICATION_ID = 1937
  }
}
