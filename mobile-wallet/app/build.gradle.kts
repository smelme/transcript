plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.smartcollege.transcript.wallet"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.smartcollege.transcript.wallet"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // Override with: ./gradlew assembleDebug -PissuerBaseUrl=http://10.0.2.2:3000
        val issuerBaseUrl = (project.findProperty("issuerBaseUrl") as? String)
            ?: "https://issuer.smartcollege.example"
        buildConfigField("String", "ISSUER_BASE_URL", "\"$issuerBaseUrl\"")

        // Android App Link host for same-device issuance. Leave unset (inert
        // placeholder) until a domain serving /.well-known/assetlinks.json is
        // pointed at this app; then build with:
        //   -PwalletAppLinkHost=quals.example
        val walletAppLinkHost = (project.findProperty("walletAppLinkHost") as? String)
            ?: "applink.invalid"
        manifestPlaceholders["walletAppLinkHost"] = walletAppLinkHost
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling)
    implementation(libs.androidx.activity.compose)

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.biometric)
    implementation(libs.google.code.scanner)

    implementation(libs.androidx.credentials)
    implementation(libs.play.services.identity.credentials)

    testImplementation(libs.junit)
}
