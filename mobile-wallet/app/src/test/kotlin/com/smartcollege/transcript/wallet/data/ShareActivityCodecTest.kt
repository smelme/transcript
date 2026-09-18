package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The holder's own record of what they have handed over.
 *
 * Two properties matter here: a disclosure that happened reads back exactly as it was recorded,
 * and one damaged record cannot take the rest of the history down with it.
 */
class ShareActivityCodecTest {

    private fun activity(
        recipient: String = "registrar@example.edu",
        recipientName: String? = "Registrar",
        sharedAt: Long = 1_760_000_000_000L,
        method: String = ShareActivityCodec.METHOD_EMAIL,
        disclosure: Map<String, List<String>> = linkedMapOf(
            AcademicNamespaces.PHOTO_ID to listOf("given_name", "family_name"),
            AcademicNamespaces.QUALIFICATION to listOf("award_title"),
        ),
    ) = ShareActivity(
        credentialId = "cred-1",
        sharedAt = sharedAt,
        recipient = recipient,
        recipientName = recipientName,
        method = method,
        disclosure = disclosure,
    )

    @Test
    fun `a disclosure reads back as it was recorded`() {
        val recorded = activity()

        val read = ShareActivityCodec.decode(ShareActivityCodec.encode(listOf(recorded)))

        assertEquals(listOf(recorded), read)
        assertEquals("what was disclosed is counted per field", 3, read.single().claimCount)
        assertEquals(2, read.single().sectionCount)
    }

    @Test
    fun `a presentment is recorded against the site it went to, with no recipient name`() {
        val recorded = activity(
            recipient = "https://registry.example",
            recipientName = null,
            method = ShareActivityCodec.METHOD_PRESENTMENT,
        )

        val read = ShareActivityCodec.decode(ShareActivityCodec.encode(listOf(recorded))).single()

        assertEquals("https://registry.example", read.recipient)
        assertNull(read.recipientName)
        assertEquals(ShareActivityCodec.METHOD_PRESENTMENT, read.method)
    }

    @Test
    fun `a record that cannot be read does not take the log with it`() {
        val good = ShareActivityCodec.encode(listOf(activity()))
        val oneGoodOneBroken = """[{"sharedAt":1},${good.removeSurrounding("[", "]")}]"""

        val read = ShareActivityCodec.decode(oneGoodOneBroken)

        assertEquals("the unreadable entry is dropped", 1, read.size)
        assertEquals("registrar@example.edu", read.single().recipient)
    }

    @Test
    fun `nothing recorded reads as an empty log`() {
        assertEquals(emptyList<ShareActivity>(), ShareActivityCodec.decode(null))
        assertEquals(emptyList<ShareActivity>(), ShareActivityCodec.decode(""))
        assertEquals(emptyList<ShareActivity>(), ShareActivityCodec.decode("not json"))
        assertEquals(emptyList<ShareActivity>(), ShareActivityCodec.decode("{}"))
    }

    @Test
    fun `a record with no time reads as undated rather than as 1970`() {
        val undated = """[{"credentialId":"cred-1","recipient":"a@b.c","disclosure":{}}]"""

        val read = ShareActivityCodec.decode(undated).single()

        assertEquals(0L, read.sharedAt)
        assertEquals("no disclosure recorded is still a disclosure record", 0, read.claimCount)
    }

    @Test
    fun `the log is newest first and bounded`() {
        var log = emptyList<ShareActivity>()
        for (index in 1..ShareActivityLog.MAX_PER_CREDENTIAL + 5) {
            log = ShareActivityLog.record(log, activity(recipient = "r$index"))
        }

        assertEquals(ShareActivityLog.MAX_PER_CREDENTIAL, log.size)
        assertEquals("the newest disclosure is first", "r55", log.first().recipient)
        assertEquals("the oldest are dropped", "r6", log.last().recipient)
    }
}
