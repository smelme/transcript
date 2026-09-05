package com.smartcollege.transcript.wallet.ui

import android.net.Uri
import android.widget.VideoView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

@Composable
fun VideoLogo(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val uri = Uri.parse("android.resource://${context.packageName}/raw/logo")
    AndroidView(
        factory = { ctx ->
            VideoView(ctx).apply {
                setVideoURI(uri)
                setOnPreparedListener { mediaPlayer ->
                    mediaPlayer.isLooping = true
                    start()
                }
                setOnCompletionListener { mediaPlayer ->
                    mediaPlayer.start()
                }
            }
        },
        modifier = modifier,
    )
}

@Composable
fun BrandSplash(onFinished: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(2400)
        onFinished()
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            VideoLogo(Modifier.size(200.dp))
            Spacer(Modifier.height(10.dp))
            Text(
                "QUALS",
                color = QualsGold,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 8.sp,
                fontSize = 22.sp,
            )
        }
    }
}
