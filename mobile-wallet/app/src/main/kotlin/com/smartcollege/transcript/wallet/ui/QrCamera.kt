package com.smartcollege.transcript.wallet.ui

import android.content.Context
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** What came back from the camera. */
sealed interface ScanOutcome {
    /** A code was read, and this is what it carried. */
    data class Code(val raw: String) : ScanOutcome

    /** The holder closed the camera, which is not a failure and rarely worth saying. */
    data object Cancelled : ScanOutcome

    /** The camera could not be used at all. */
    data class Failed(val message: String) : ScanOutcome
}

/**
 * The camera, configured the one way this wallet ever wants it.
 *
 * The scanner runs in its own Activity, which pauses the wallet. [read] says so through
 * `onOpenChange`, because the host has to know the difference between the holder leaving the wallet
 * and the camera covering it - otherwise it re-locks, tearing down the scan it was asked to do.
 */
fun scannerFor(context: Context): GmsBarcodeScanner = GmsBarcodeScanning.getClient(
    context,
    GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .enableAutoZoom()
        .build(),
)

fun GmsBarcodeScanner.read(onOpenChange: (Boolean) -> Unit, onOutcome: (ScanOutcome) -> Unit) {
    onOpenChange(true)
    startScan()
        .addOnSuccessListener { barcode ->
            onOpenChange(false)
            val raw = barcode.rawValue
            onOutcome(if (raw.isNullOrBlank()) ScanOutcome.Cancelled else ScanOutcome.Code(raw))
        }
        .addOnFailureListener { error ->
            onOpenChange(false)
            // Closing the camera reports itself as a failure; a camera that will not open is one.
            val text = error.message.orEmpty()
            onOutcome(
                if (text.contains("cancel", ignoreCase = true)) ScanOutcome.Cancelled
                else ScanOutcome.Failed(text.ifBlank { "Unable to open the camera." })
            )
        }
}
