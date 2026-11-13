# Kept through R8 in the app's release build (minified): WorkManager makes its Room
# database and its workers by reflection.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }
