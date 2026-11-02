import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isWindows = process.platform === "win32";
const environment = { ...process.env };

if (isWindows && environment.LOCALAPPDATA) {
  const installRoot = resolve(environment.LOCALAPPDATA, "LifeOSAndroidBuild");
  const jdkRoot = resolve(installRoot, "jdk-extracted");
  if (!environment.JAVA_HOME && existsSync(jdkRoot)) {
    const javaHome = readdirSync(jdkRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("jdk-21"))
      .map((entry) => resolve(jdkRoot, entry.name))
      .find((path) => existsSync(resolve(path, "bin", "java.exe")));
    if (javaHome) {
      environment.JAVA_HOME = javaHome;
      environment.PATH = `${resolve(javaHome, "bin")}${delimiter}${environment.PATH ?? ""}`;
    }
  }
  const sdkRoot = resolve(installRoot, "sdk");
  if (!environment.ANDROID_HOME && existsSync(resolve(sdkRoot, "platform-tools"))) {
    environment.ANDROID_HOME = sdkRoot;
    environment.ANDROID_SDK_ROOT = sdkRoot;
  }
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"]);
run("npx", [
  "capacitor-assets",
  "generate",
  "--android",
  "--iconBackgroundColor",
  "#ffffff",
  "--iconBackgroundColorDark",
  "#101827",
]);
run("npx", ["cap", "sync", "android"]);

const gradleWrapper = isWindows ? "gradlew.bat" : "./gradlew";
run(gradleWrapper, ["assembleDebug"], resolve(root, "android"));

const apkPath = resolve(root, "android/app/build/outputs/apk/debug/app-debug.apk");
if (!existsSync(apkPath)) throw new Error(`Android build completed but APK was not found at ${apkPath}`);

const outputPath = resolve(root, "LifeOS-debug.apk");
copyFileSync(apkPath, outputPath);
console.log(`Installable debug APK created: ${outputPath}`);
