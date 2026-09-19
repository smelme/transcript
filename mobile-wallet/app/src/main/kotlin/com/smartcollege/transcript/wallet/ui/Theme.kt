package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.smartcollege.transcript.wallet.data.Appearance

// Quals brand palette. Green & white with a gold accent.
val QualsGold = Color(0xFFFFC400)
private val QualsGreen = Color(0xFF1B9C5B)
private val QualsGreenDark = Color(0xFF0E6B3D)
private val QualsGreenLight = Color(0xFF5BD496)
private val QualsWhite = Color(0xFFFFFFFF)
private val QualsInk = Color(0xFF0B0F0C)

private val LightColors = lightColorScheme(
    primary = QualsGold,
    onPrimary = QualsInk,
    primaryContainer = Color(0xFFFFE9A8),
    onPrimaryContainer = Color(0xFF4A3B00),
    secondary = QualsGreen,
    onSecondary = QualsWhite,
    secondaryContainer = Color(0xFFE2F7EC),
    onSecondaryContainer = QualsGreenDark,
    tertiary = QualsGreenLight,
    background = QualsWhite,
    onBackground = QualsInk,
    surface = QualsWhite,
    onSurface = QualsInk,
    surfaceVariant = Color(0xFFEFF6F1),
    onSurfaceVariant = Color(0xFF2A3A30),
)

private val DarkColors = darkColorScheme(
    primary = QualsGold,
    onPrimary = QualsInk,
    primaryContainer = Color(0xFF4A3B00),
    onPrimaryContainer = Color(0xFFFFE9A8),
    secondary = QualsGreenLight,
    onSecondary = QualsGreenDark,
    secondaryContainer = Color(0xFF123F2A),
    onSecondaryContainer = Color(0xFFE2F7EC),
    tertiary = QualsGreen,
    background = Color(0xFF0B0F0C),
    onBackground = Color(0xFFE6EFE9),
    surface = Color(0xFF101612),
    onSurface = Color(0xFFE6EFE9),
    surfaceVariant = Color(0xFF1B231E),
    onSurfaceVariant = Color(0xFFB8C7BE),
)

@Composable
fun QualsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}

/** The theme as the holder asked for it: their choice, or the device's if they have not chosen. */
@Composable
fun QualsTheme(appearance: Appearance, content: @Composable () -> Unit) =
    QualsTheme(darkTheme = appearance.dark(isSystemInDarkTheme()), content = content)
