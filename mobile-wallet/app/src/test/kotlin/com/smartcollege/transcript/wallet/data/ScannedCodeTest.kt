package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The scanner sees whatever is held in front of it, so deciding what that was is the whole of the
 * logic. It is pure, and it is the difference between claiming a credential and swallowing a code
 * meant for the system's credential manager.
 */
class ScannedCodeTest {

    @Test
    fun `our own offer urls are read as offers`() {
        val scheme = "openid-credential-offer://?credential_offer=eyJjcmVkZW50aWFsX2lzc3VlciI6IngifQ"
        assertEquals(ScannedCode.CredentialOffer(scheme), ScannedCode.of(scheme))
    }

    @Test
    fun `an app link offer stays an offer rather than becoming a web link`() {
        // The invitation arrives as an https:// URL, and must not be handed to the browser.
        val appLink = "https://academy.test/offer?credential_offer=eyJhIjoxfQ"
        assertEquals(ScannedCode.CredentialOffer(appLink), ScannedCode.of(appLink))
    }

    @Test
    fun `a bare session id is an offer`() {
        val sessionId = "d7c2f0aa-0000-4000-8000-000000000000"
        assertEquals(ScannedCode.CredentialOffer(sessionId), ScannedCode.of(sessionId))
    }

    @Test
    fun `fido urls are set aside for the system, whatever case they arrive in`() {
        listOf("FIDO:/1234", "fido:/1234", "  FIDO:/1234  ", "fido://1234").forEach { code ->
            val scanned = ScannedCode.of(code)
            assertEquals("$code should be a FIDO link", ScannedCode.FidoLink(code.trim()), scanned)
        }
    }

    @Test
    fun `another link is a link`() {
        listOf("https://example.com/x", "http://example.com", "myapp://open?x=1").forEach { link ->
            assertEquals(ScannedCode.WebLink(link), ScannedCode.of(link))
        }
    }

    @Test
    fun `fido in the middle of a link is not a fido url`() {
        // Matching on a substring would swallow a link that merely mentions one.
        val link = "https://example.com/fido:/1234"
        assertEquals(ScannedCode.WebLink(link), ScannedCode.of(link))
    }

    @Test
    fun `a colon is not enough to make something a link`() {
        // The camera app does not offer to open "note: 5" either.
        assertEquals(ScannedCode.Unknown("note: 5"), ScannedCode.of("note: 5"))
    }

    @Test
    fun `nothing is nothing`() {
        assertEquals(ScannedCode.Unknown(""), ScannedCode.of(null))
        // What was scanned is carried through as it was seen, whitespace and all, so a holder who
        // scans the wrong thing can be told what was actually read.
        assertEquals(ScannedCode.Unknown("   "), ScannedCode.of("   "))
        assertEquals(ScannedCode.Unknown("hello world"), ScannedCode.of("hello world"))
    }
}
