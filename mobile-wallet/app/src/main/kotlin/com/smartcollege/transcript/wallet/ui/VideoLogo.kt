package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.smartcollege.transcript.wallet.R
import kotlinx.coroutines.delay

/** The Quals brand mark (navy Q + graduation cap + QUALS wordmark). */
@Composable
fun QualsLogoMark(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.quals_logo),
        contentDescription = "Quals",
        modifier = modifier.clip(RoundedCornerShape(28.dp)),
        contentScale = ContentScale.Crop,
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
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        QualsLogoMark(Modifier.size(220.dp))
    }
}
