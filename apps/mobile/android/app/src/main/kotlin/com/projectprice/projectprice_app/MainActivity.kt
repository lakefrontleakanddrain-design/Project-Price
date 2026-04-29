package com.projectprice.projectprice_app

import android.os.Bundle
import androidx.core.view.WindowCompat
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		// Opt in to edge-to-edge so system bars overlay app content on modern Android.
		WindowCompat.setDecorFitsSystemWindows(window, false)
	}
}
