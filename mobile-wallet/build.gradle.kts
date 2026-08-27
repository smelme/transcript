plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.ksp)
}

kotlin {
    jvmToolchain(17)

    androidTarget()

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { it.binaries.framework { baseName = "TranscriptWallet" } }

    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlin.stdlib)
        }
        androidMain.dependencies { }
        iosMain.dependencies { }
    }
}

android {
    namespace = "com.smartcollege.transcript.wallet"
    compileSdk = 34

    defaultConfig {
        minSdk = 21
    }
}
