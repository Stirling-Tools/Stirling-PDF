plugins {
    `kotlin-dsl`
}

repositories {
    gradlePluginPortal()
}

dependencies {
    implementation(gradleApi())
    // groovy.json parses and writes the overrides file; Gradle's runtime already ships Groovy.
    implementation(localGroovy())
    implementation("com.github.jk1:gradle-license-report:3.1.4")
    testImplementation(platform("org.junit:junit-bom:6.1.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.named<Test>("test") {
    useJUnitPlatform()
    jvmArgs("--add-opens=java.base/java.lang=ALL-UNNAMED")
    testLogging.showStandardStreams = true
}
