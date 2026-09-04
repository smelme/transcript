package com.smartcollege.transcript.wallet.presentation

import com.smartcollege.transcript.wallet.data.CborCodec
import com.smartcollege.transcript.wallet.data.CborRaw
import com.smartcollege.transcript.wallet.data.CborTagged
import com.smartcollege.transcript.wallet.data.CryptoUtil
import java.security.PrivateKey

/**
 * Builds an ISO/IEC 18013-7 Annex C (W3C Digital Credentials API `org-iso-mdoc`)
 * encrypted DeviceResponse. Mirrors the reference implementation used by the
 * independent verifier so both sides agree byte-for-byte on the session
 * transcript, DeviceAuthentication, and HPKE parameters.
 */
object MdocResponseBuilder {

    /** Parsed request payload (deviceRequest + encryptionInfo) for consent display. */
    data class ParsedRequest(
        val docType: String,
        val requestedClaims: Map<String, Set<String>>,
    )

    fun parseRequest(deviceRequestBase64Url: String): ParsedRequest {
        val request = CborCodec.decode(CryptoUtil.base64UrlDecode(deviceRequestBase64Url)) as Map<*, *>
        val docRequests = request["docRequests"] as List<*>
        val firstDocRequest = docRequests[0] as Map<*, *>
        val itemsRequestTag = firstDocRequest["itemsRequest"] as CborTagged
        val itemsRequest = CborCodec.decode(itemsRequestTag.value as ByteArray) as Map<*, *>
        val docType = itemsRequest["docType"] as String
        val nameSpaces = itemsRequest["nameSpaces"] as Map<*, *>
        val requestedClaims = LinkedHashMap<String, Set<String>>()
        for ((ns, fields) in nameSpaces) {
            val fieldNames = (fields as Map<*, *>).keys.filterIsInstance<String>().toSet()
            if (fieldNames.isNotEmpty()) requestedClaims[ns as String] = fieldNames
        }
        return ParsedRequest(docType, requestedClaims)
    }

    /**
     * @param deviceRequestBase64Url the base64url `deviceRequest` from the request JSON.
     * @param encryptionInfoBase64Url the base64url `encryptionInfo` from the request JSON.
     * @param origin the verified relying-party origin.
     * @param mdocBase64Url the stored IssuerSigned mdoc.
     * @param devicePrivateKey the Android Keystore EC P-256 device key (non-exportable).
     * @return the base64url of `["dcapi", {"enc": ..., "cipherText": ...}]` to send back.
     */
    fun build(
        deviceRequestBase64Url: String,
        encryptionInfoBase64Url: String,
        origin: String,
        mdocBase64Url: String,
        devicePrivateKey: PrivateKey,
    ): String {
        // 1. Requested document type and claims.
        val request = CborCodec.decode(CryptoUtil.base64UrlDecode(deviceRequestBase64Url)) as Map<*, *>
        val docRequests = request["docRequests"] as List<*>
        val firstDocRequest = docRequests[0] as Map<*, *>
        val itemsRequestTag = firstDocRequest["itemsRequest"] as CborTagged
        val itemsRequest = CborCodec.decode(itemsRequestTag.value as ByteArray) as Map<*, *>
        val docType = itemsRequest["docType"] as String
        val requestedNameSpaces = itemsRequest["nameSpaces"] as Map<*, *>

        // 2. Recipient (reader) public key from the encryptionInfo.
        val encryptionInfo = CborCodec.decode(CryptoUtil.base64UrlDecode(encryptionInfoBase64Url)) as List<*>
        val encryptionParameters = encryptionInfo[1] as Map<*, *>
        val (x, y) = CryptoUtil.coseKeyToPoint(encryptionParameters["recipientPublicKey"])
        val recipientPublicKey = CryptoUtil.publicKeyFromCoordinates(x, y)

        // 3. Session transcript: [null, null, ["dcapi", SHA256([encryptionInfoB64Url, origin])]]
        val dcapiInfo = CborCodec.encode(listOf(encryptionInfoBase64Url, origin))
        val sessionTranscript = CborCodec.encode(
            listOf(null, null, listOf("dcapi", CryptoUtil.sha256(dcapiInfo)))
        )

        // 4. Stored IssuerSigned: filter name spaces down to requested claims.
        val issuerSigned = CborCodec.decode(CryptoUtil.base64UrlDecode(mdocBase64Url)) as Map<*, *>
        val issuerNameSpaces = issuerSigned["nameSpaces"] as Map<*, *>
        val issuerAuth = issuerSigned["issuerAuth"] as List<*>

        val disclosedNameSpaces = LinkedHashMap<Any?, Any?>()
        for ((ns, fields) in requestedNameSpaces) {
            val wanted = (fields as Map<*, *>).keys.filterIsInstance<String>().toSet()
            val items = issuerNameSpaces[ns] as? List<*> ?: continue
            val keep = ArrayList<CborRaw>()
            for (item in items) {
                val tag = item as CborTagged
                val itemCbor = tag.value as ByteArray
                val itemMap = CborCodec.decode(itemCbor) as Map<*, *>
                val elementIdentifier = itemMap["elementIdentifier"] as String
                if (elementIdentifier in wanted) {
                    keep.add(CborRaw(CborCodec.encode(CborTagged(24, itemCbor))))
                }
            }
            if (keep.isNotEmpty()) disclosedNameSpaces[ns] = keep
        }

        // 5. Device-signed data is empty for this flow (all claims are issuer-signed);
        //    the device signature proves possession of the device key.
        val deviceNameSpacesBytes = CborCodec.encode(emptyMap<Any?, Any?>())
        val deviceAuthentication = listOf(
            "DeviceAuthentication",
            CborRaw(sessionTranscript),
            docType,
            CborTagged(24, deviceNameSpacesBytes),
        )
        val deviceAuthenticationBytes = CborCodec.encode(CborTagged(24, CborCodec.encode(deviceAuthentication)))
        val protectedHeader = CborCodec.encode(mapOf(1L to -7L))

        // COSE_Sign1 signs the Sig_structure, not the raw payload:
        // Sig_structure = ["Signature1", body_protected(bstr), external_aad(bstr), payload(bstr)]
        val sigStructure = CborCodec.encode(
            listOf("Signature1", protectedHeader, ByteArray(0), deviceAuthenticationBytes)
        )
        val signature = CryptoUtil.ecdsaSignP1363(devicePrivateKey, sigStructure)

        val deviceSignature = listOf(
            protectedHeader,
            mapOf<Any?, Any?>(),
            deviceAuthenticationBytes,
            signature,
        )

        // 6. Document and DeviceResponse.
        val document = mapOf<Any?, Any?>(
            "docType" to docType,
            "issuerSigned" to mapOf<Any?, Any?>(
                "nameSpaces" to disclosedNameSpaces,
                "issuerAuth" to issuerAuth,
            ),
            "deviceSigned" to mapOf<Any?, Any?>(
                "nameSpaces" to CborTagged(24, deviceNameSpacesBytes),
                "deviceAuth" to mapOf<Any?, Any?>("deviceSignature" to deviceSignature),
            ),
        )
        val deviceResponse = CborCodec.encode(
            mapOf<Any?, Any?>(
                "version" to "1.0",
                "documents" to listOf(document),
                "status" to 0L,
            )
        )

        // 7. HPKE-encrypt the DeviceResponse to the reader key.
        val (enc, cipherText) = CryptoUtil.hpkeEncrypt(recipientPublicKey, sessionTranscript, deviceResponse)
        val encryptedResponse = CborCodec.encode(
            listOf(
                "dcapi",
                mapOf<Any?, Any?>("enc" to enc, "cipherText" to cipherText),
            )
        )
        return CryptoUtil.base64UrlEncode(encryptedResponse)
    }
}
