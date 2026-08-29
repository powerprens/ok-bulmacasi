package com.oakever.amazego

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity

class MainActivity : ComponentActivity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true           // localStorage → seviye kaydı kalıcı
            allowFileAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        web.setBackgroundColor(0xFF08080D.toInt())
        web.webViewClient = WebViewClient()
        web.webChromeClient = WebChromeClient()
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
