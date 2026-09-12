package com.smartcollege.transcript.wallet.data

/**
 * The namespaces that decide what a stored credential is.
 *
 * Both credential kinds are issued under the photo-ID docType, so the academic namespace
 * is the only thing that tells them apart. It is also what a relying party asks for, which
 * makes it the thing eligibility is decided on: a request for the transcript namespace is
 * not satisfied by a qualification credential.
 *
 * The kind values mirror the issuer's own rule, so the wallet and the issuer label the same
 * credential the same way.
 */
object AcademicNamespaces {
    const val PHOTO_ID = "org.iso.23220.photoid.1"
    const val QUALIFICATION = "org.iso.23220.education.qualification.1"
    const val TRANSCRIPT = "org.iso.23220.education.transcript.1"

    const val KIND_QUALIFICATION = "qualification"
    const val KIND_TRANSCRIPT = "transcript"

    /** A credential holding both, as issued before the holder could choose. */
    const val KIND_BOTH = "academic"

    /** A credential holding no academic namespace at all. */
    const val KIND_UNKNOWN = "credential"

    /** The kind a credential's namespaces imply. */
    fun kindOf(namespaces: Collection<String>): String {
        val held = namespaces.toSet()
        return when {
            QUALIFICATION in held && TRANSCRIPT in held -> KIND_BOTH
            TRANSCRIPT in held -> KIND_TRANSCRIPT
            QUALIFICATION in held -> KIND_QUALIFICATION
            else -> KIND_UNKNOWN
        }
    }

    /**
     * How the holder sees the kind. A credential holding no academic namespace is not given
     * a kind it does not have: it is shown as an academic credential, by its own docType.
     */
    fun labelOf(kind: String): String = when (kind) {
        KIND_QUALIFICATION -> "Qualification certificate"
        KIND_TRANSCRIPT -> "Academic transcript"
        KIND_BOTH -> "Qualification and transcript"
        else -> "Academic credential"
    }

    /** The academic namespaces a kind holds, for matching a request against it. */
    fun namespacesOf(kind: String): List<String> = when (kind) {
        KIND_QUALIFICATION -> listOf(QUALIFICATION)
        KIND_TRANSCRIPT -> listOf(TRANSCRIPT)
        KIND_BOTH -> listOf(QUALIFICATION, TRANSCRIPT)
        else -> emptyList()
    }
}

/**
 * Whether a stored credential can satisfy a request, decided by what the request asks for.
 *
 * Kept free of Android dependencies so the rule can be tested without a device.
 */
object PresentationEligibility {
    /**
     * A credential of [kind] can answer a request for [requiredNamespaces] when it holds
     * every namespace asked for. A request that names no namespaces constrains nothing, and
     * a credential holding neither academic namespace is eligible only for such a request.
     */
    fun satisfies(kind: String, requiredNamespaces: Collection<String>): Boolean {
        if (requiredNamespaces.isEmpty()) return true
        val held = AcademicNamespaces.namespacesOf(kind).toSet()
        return held.containsAll(requiredNamespaces)
    }

    /** Whether the holder has anything at all that can answer the request. */
    fun anySatisfies(kinds: Collection<String>, requiredNamespaces: Collection<String>): Boolean =
        kinds.any { satisfies(it, requiredNamespaces) }
}
