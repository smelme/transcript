package com.smartcollege.transcript.wallet.data

/**
 * How the holder wants the wallet to look.
 *
 * Device is the default and stays the default, because the phone already knows: a wallet that
 * insists on its own answer overrides a choice the holder has already made everywhere else.
 */
enum class Appearance(val stored: String, val label: String) {
    System("system", "Device"),
    Light("light", "Light"),
    Dark("dark", "Dark");

    /** Whether to draw in the dark palette, given what the device is set to. */
    fun dark(systemInDark: Boolean): Boolean = when (this) {
        System -> systemInDark
        Light -> false
        Dark -> true
    }

    companion object {
        fun of(stored: String?): Appearance = entries.firstOrNull { it.stored == stored } ?: System
    }
}
