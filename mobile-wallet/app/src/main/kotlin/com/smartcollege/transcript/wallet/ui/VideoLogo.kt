package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.smartcollege.transcript.wallet.R
import kotlinx.coroutines.delay

/** The Quals brand mark (white Q). */
@Composable
fun QualsLogoMark(modifier: Modifier = Modifier) {
    val painter = painterResource(R.drawable.quals_logo)
    val natural: Size = painter.intrinsicSize
    val ratio = if (natural.width > 0f && natural.height > 0f) natural.width / natural.height else 1f
    Image(
        painter = painter,
        contentDescription = "Quals",
        modifier = modifier
            .aspectRatio(ratio)
            .background(Color.Transparent),
        contentScale = ContentScale.Fit,
    )
}

@Composable
fun BrandSplash(onFinished: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(2000)
        onFinished()
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        QualsLogoMark(Modifier.width(250.dp))
    }
}
