package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The one decision this setting makes: the holder's choice, or the device's. */
class AppearanceTest {

    @Test
    fun `device follows the phone`() {
        assertTrue(Appearance.System.dark(systemInDark = true))
        assertFalse(Appearance.System.dark(systemInDark = false))
    }

    @Test
    fun `light and dark mean what they say, whatever the phone is set to`() {
        assertFalse(Appearance.Light.dark(systemInDark = true))
        assertFalse(Appearance.Light.dark(systemInDark = false))
        assertTrue(Appearance.Dark.dark(systemInDark = true))
        assertTrue(Appearance.Dark.dark(systemInDark = false))
    }

    @Test
    fun `what was chosen comes back as what was chosen`() {
        Appearance.entries.forEach { option ->
            assertEquals(option, Appearance.of(option.stored))
        }
    }

    @Test
    fun `nothing chosen, or something unrecognised, is device`() {
        // A setting the holder never made must not land them in a theme they did not ask for.
        assertEquals(Appearance.System, Appearance.of(null))
        assertEquals(Appearance.System, Appearance.of(""))
        assertEquals(Appearance.System, Appearance.of("sepia"))
    }
}
