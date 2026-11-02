# Android APK

LifeOS can be packaged as an Android app with Capacitor. Install Node.js, JDK 21, and Android SDK Platform 35, Build Tools 35.0.0, and Platform Tools. Set `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to those installations.

Configure `.env` with the Supabase project URL and anon key, then build the installable debug APK:

```sh
npm install
npm run android:apk
```

The command builds the web app, generates the Android launcher icon from `assets/logo.png`, syncs the Capacitor project, builds the APK, and copies it to `LifeOS-debug.apk` in the repository root.

This debug APK is signed with the standard debug key for local installation and testing. A release APK for distribution or Google Play requires a private release signing key and a separately configured release build.

## Offline data and reminders

Sign in and connect to the internet once so LifeOS can download your account records to the app's local IndexedDB store. After that, record changes are saved on the device first and queued for Supabase; the queue syncs when connectivity returns. If the same record changed remotely while this device was offline, the queued device change is applied last. Keep the app installed and its local storage intact until pending changes have synced.

Expense transactions that split an amount between an account and a borrowed/lent person use the idempotent `create_expense_with_funding_split` RPC. Apply the Supabase migrations, including `0011_idempotent_offline_expenses.sql` and `0012_task_habit_recurrence.sql`, before syncing queued expense splits or using task and habit recurrence.

In Settings, enable **On-device reminders** and grant Android notification permission. LifeOS schedules upcoming task due dates, calendar events, recurring transactions, habit reminders, and scheduled in-app notifications locally, so those reminders do not require an internet connection at delivery time. Android may still defer notifications according to battery and notification settings.
