package com.smartcollege.transcript.wallet.ui

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Open a scanned link the way the camera app does: hand it to whichever app registered for the
 * scheme, and let the system work out what to do with it. Returns a message to show when nothing
 * on the phone can take it, and null when it was opened.
 */
fun openExternally(context: Context, url: String): String? {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
    // A composable is normally hosted by an Activity; anything else needs the flag.
    if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
        context.startActivity(intent)
        null
    } catch (e: ActivityNotFoundException) {
        "Nothing on this phone handles that kind of link, so there is no app to open it with."
    } catch (e: SecurityException) {
        "That link was refused by the app that handles it."
    }
}
