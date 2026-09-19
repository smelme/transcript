package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * How one institution's credential is presented: a mark, the name, and the two tones of its card.
 *
 * A printed credential is not one flat colour, so neither is this: the card is a gradient from
 * [top] to [bottom], which is what makes it read as a document rather than as a coloured tile.
 *
 * The mark stands in for a logo this wallet has no licence to redistribute. It is drawn as a
 * monogram inside a ring - the shape a registrar's seal has - and the institutions below carry the
 * colours a reader would recognise them by. A deployment with permission swaps the ring for the
 * institution's own crest, which is the only reason this is a monogram and not an asset.
 */
internal data class InstitutionBrand(
    val mark: String,
    val title: String,
    val top: Color,
    val bottom: Color,
)

private val InstitutionBrands = mapOf(
    "smart academy" to InstitutionBrand("SA", "Smart Academy", Color(0xFF1B3A6B), Color(0xFF0B1A33)),
    "university of auckland" to InstitutionBrand(
        "AU",
        "University of Auckland",
        Color(0xFF0B2E5C),
        Color(0xFF03101F),
    ),
    "university of otago" to InstitutionBrand(
        "OU",
        "University of Otago",
        Color(0xFF0C5468),
        Color(0xFF04222D),
    ),
    "mit" to InstitutionBrand("MIT", "MIT", Color(0xFF8A0F22), Color(0xFF3D050D)),
    "aws" to InstitutionBrand("AWS", "AWS", Color(0xFF33465A), Color(0xFF131B24)),
)

/** The colours an institution the wallet has no assets for is given, so its card still looks made. */
private val UnknownBrandTones = listOf(
    Color(0xFF1D3557) to Color(0xFF0B1A30),
    Color(0xFF1B5E20) to Color(0xFF0A2B0E),
    Color(0xFF6A1B2A) to Color(0xFF320710),
    Color(0xFF4A148C) to Color(0xFF22083F),
    Color(0xFF006064) to Color(0xFF002A2D),
    Color(0xFF4E342E) to Color(0xFF251712),
)

internal fun brandOf(institution: String): InstitutionBrand {
    val name = institution.trim().ifBlank { "Smart Academy" }
    InstitutionBrands[name.lowercase()]?.let { return it }
    // An institution the wallet has no assets for: initials from the name and a pair of tones from
    // it, so its card looks deliberate rather than falling back to a default grey.
    val hash = name.hashCode().let { if (it == Int.MIN_VALUE) 0 else kotlin.math.abs(it) }
    val (top, bottom) = UnknownBrandTones[hash % UnknownBrandTones.size]
    return InstitutionBrand(initialsOf(name).ifBlank { "ID" }, name, top, bottom)
}

/** Initials for a card or a panel: "University of Auckland" is "AU", "tessa.novak@x.com" is "TN". */
internal fun initialsOf(name: String): String = name
    .split(' ', '-', '_', '.', '@')
    .filter { it.isNotBlank() }
    .take(4)
    .map { it.first().uppercaseChar() }
    .joinToString("")

/**
 * The card's face: the institution's colour as a gradient, with the printing an identity document
 * is expected to carry - angled hairlines across it and a mark large and quiet behind the text.
 */
internal fun Modifier.licenceFace(brand: InstitutionBrand): Modifier = drawBehind {
    drawRect(
        Brush.linearGradient(
            colors = listOf(brand.top, brand.bottom),
            start = Offset.Zero,
            end = Offset(size.width, size.height),
        )
    )
    // Hairlines, angled the way a security print is: close enough to read as texture, faint enough
    // not to compete with the name.
    val step = size.height / 8f
    var y = -size.width * 0.5f
    while (y < size.height) {
        drawLine(
            color = Color.White.copy(alpha = 0.045f),
            start = Offset(0f, y),
            end = Offset(size.width, y + size.width * 0.4f),
            strokeWidth = 1.5f,
        )
        y += step
    }
    // A ring the size of the card, mostly off the edge, the way a watermark is cropped.
    drawCircle(
        color = Color.White.copy(alpha = 0.05f),
        radius = size.height * 0.55f,
        center = Offset(size.width * 0.82f, size.height * 0.5f),
        style = androidx.compose.ui.graphics.drawscope.Stroke(width = size.height * 0.06f),
    )
}

/**
 * The institution's seal: its monogram inside a ring.
 *
 * It replaces a logo rather than imitating one, which is the honest thing to do with somebody
 * else's trademark - and a ring is what a credential would be stamped with anyway.
 */
@Composable
internal fun InstitutionSeal(brand: InstitutionBrand, size: Dp = 38.dp) {
    Box(
        modifier = Modifier
            .size(size)
            .background(Color.White.copy(alpha = 0.12f), CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.45f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            brand.mark,
            color = Color.White,
            // A three or four letter mark needs smaller type to sit in the same ring.
            fontSize = if (brand.mark.length > 2) (size.value * 0.3f).sp else (size.value * 0.4f).sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
        )
    }
}

/** The mark a verified credential carries, in the corner of the card where a seal would be. */
@Composable
internal fun VerifiedPill() {
    Box(
        modifier = Modifier
            .background(Color.White.copy(alpha = 0.16f), RoundedCornerShape(999.dp))
            .border(1.dp, Color.White.copy(alpha = 0.28f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("\u2713", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.size(4.dp))
            Text(
                "VERIFIED",
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
        }
    }
}

/**
 * The face of a credential, drawn like the document it stands for.
 *
 * An identity document carries the same things every time - whose it is, who issued it, when, and
 * under which number - so they are laid out the way such a document lays them out, in micro-labels
 * beneath the name, rather than as a list row with a label on the left.
 *
 * @param compact the size used in the wallet's list, where the card is one of several.
 */
@Composable
internal fun CredentialFace(
    brand: InstitutionBrand,
    personName: String,
    subtitle: String?,
    credentialId: String,
    issuedDate: String?,
    compact: Boolean,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(if (compact) 18.dp else 24.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .licenceFace(brand),
    ) {
        // The watermark: the holder's own initials, as large and as quiet as a printed one.
        Text(
            initialsOf(personName),
            color = Color.White.copy(alpha = 0.07f),
            fontSize = if (compact) 74.sp else 104.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp),
        )
        Column(Modifier.padding(if (compact) 16.dp else 22.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                InstitutionSeal(brand, if (compact) 30.dp else 38.dp)
                Spacer(Modifier.size(10.dp))
                Text(
                    brand.title.uppercase(),
                    color = Color.White.copy(alpha = 0.88f),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 1.sp,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                if (!compact) VerifiedPill()
            }
            Spacer(Modifier.height(if (compact) 12.dp else 18.dp))
            Text(
                personName,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = if (compact) {
                    MaterialTheme.typography.titleLarge
                } else {
                    MaterialTheme.typography.headlineMedium
                },
            )
            subtitle?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(3.dp))
                Text(
                    it,
                    color = Color.White.copy(alpha = 0.82f),
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                )
            }
            Spacer(Modifier.height(if (compact) 12.dp else 18.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                FaceField("ISSUED", issuedDate ?: "—", Modifier.weight(1f))
                FaceField("CREDENTIAL NO.", faceReference(credentialId), Modifier.weight(1f))
                if (compact) VerifiedPill()
            }
            Spacer(Modifier.height(if (compact) 10.dp else 14.dp))
            // The colour band along the foot of a printed card.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                repeat(6) {
                    Box(
                        Modifier
                            .height(3.dp)
                            .weight(1f)
                            .background(Color.White.copy(alpha = 0.3f), RoundedCornerShape(2.dp)),
                    )
                }
            }
        }
    }
}

/** One of the card's micro-labelled fields: the label a document prints above its own values. */
@Composable
private fun FaceField(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(
            label,
            color = Color.White.copy(alpha = 0.55f),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            maxLines = 1,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            value,
            color = Color.White.copy(alpha = 0.92f),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
        )
    }
}

/**
 * The credential's reference as a card prints it: upper case, and short enough to read at a glance.
 *
 * A UUID is the wallet's own handle for the document, so its last group is enough on a card face -
 * the whole of it is shown on the screen that lists the document's claims.
 */
private fun faceReference(credentialId: String): String {
    val tail = credentialId.split('-').lastOrNull()?.takeIf { it.isNotBlank() } ?: credentialId
    return tail.uppercase()
}
