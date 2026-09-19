package com.smartcollege.transcript.wallet.data

/**
 * What the scanner was pointed at.
 *
 * A QR code in front of a wallet is often none of the wallet's business. The Digital Credentials
 * API's cross-device code is a FIDO URL, and the phone's camera app does not try to read it: it
 * hands it to whichever app registered for that scheme, which is how the system's credential
 * manager gets to answer the request. This wallet scans the same codes, so it has to draw the same
 * conclusion. A presentation code scanned here is handed on, and ends up back at this wallet only
 * if the credential manager picks it as the provider to ask.
 */
sealed interface ScannedCode {
    /** One of our own credential offers, which this wallet can claim. */
    data class CredentialOffer(val url: String) : ScannedCode

    /** A FIDO URL: the Digital Credentials API's cross-device code, and the passkey equivalent. */
    data class FidoLink(val url: String) : ScannedCode

    /** Some other link, which the camera app would offer to open. */
    data class WebLink(val url: String) : ScannedCode

    /** Not a link at all. */
    data class Unknown(val raw: String) : ScannedCode

    companion object {
        private const val OFFER_SCHEME = "openid-credential-offer:"
        private const val FIDO_PREFIX = "fido:/"
        private const val OFFER_PARAMETER = "credential_offer="

        /** A session id on its own, which is how an offer arrives when it has been typed out. */
        private val SESSION_ID =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

        private val ABSOLUTE_URL = Regex("^[a-zA-Z][a-zA-Z0-9+.\\-]*://")

        fun of(raw: String?): ScannedCode {
            val value = raw?.trim().orEmpty()
            if (value.isEmpty()) return Unknown(raw.orEmpty())

            // An App Link offer is an https:// URL, so this test has to come before the general
            // one, or our own invitations would be offered to the browser instead of claimed.
            if (value.contains(OFFER_PARAMETER) || value.startsWith(OFFER_SCHEME, ignoreCase = true)) {
                return CredentialOffer(value)
            }
            if (SESSION_ID.matches(value)) return CredentialOffer(value)

            // FIDO's cross-device codes are `FIDO:/` followed by a payload, with one slash, so
            // they are matched by prefix rather than by the URL rule below.
            if (value.startsWith(FIDO_PREFIX, ignoreCase = true)) return FidoLink(value)

            return if (ABSOLUTE_URL.containsMatchIn(value)) WebLink(value) else Unknown(value)
        }
    }
}
