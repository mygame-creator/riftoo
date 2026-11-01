package com.example.rift

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Bundle
import android.os.Message
import android.text.InputType
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

class MainActivity : Activity() {
    private val tabs = mutableListOf<WebView>()
    private var cur = 0
    private lateinit var address: EditText
    private lateinit var holder: FrameLayout
    private lateinit var tabBtn: Button
    private lateinit var prefs: SharedPreferences

    private val bg = Color.parseColor("#0B0B10")
    private val raise = Color.parseColor("#1C1C27")
    private val accent = Color.parseColor("#FA1E4E")
    private val home = "https://www.google.com"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("rift", Context.MODE_PRIVATE)
        window.statusBarColor = bg
        window.navigationBarColor = raise

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(bg) }

        address = EditText(this).apply {
            setSingleLine()
            hint = "Search or enter address"
            setHintTextColor(Color.GRAY)
            setTextColor(Color.WHITE)
            setBackgroundColor(raise)
            setPadding(36, 28, 36, 28)
            imeOptions = EditorInfo.IME_ACTION_GO
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setOnEditorActionListener { _, _, _ -> go(text.toString()); true }
        }
        root.addView(address, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        holder = FrameLayout(this)
        root.addView(holder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setBackgroundColor(raise) }
        fun add(label: String, onClick: () -> Unit): Button {
            val b = Button(this).apply {
                text = label; setTextColor(Color.WHITE); setBackgroundColor(Color.TRANSPARENT); textSize = 18f
                setOnClickListener { onClick() }
            }
            bar.addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            return b
        }
        add("\u2039") { tabs.getOrNull(cur)?.let { if (it.canGoBack()) it.goBack() } }
        add("\u203A") { tabs.getOrNull(cur)?.let { if (it.canGoForward()) it.goForward() } }
        add("\u27F3") { tabs.getOrNull(cur)?.reload() }
        tabBtn = add("1") { showTabs() }
        add("\u2605") { showMarks() }
        add("\u2601") { showSync() }
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setContentView(root)

        newTab(intent?.data?.toString() ?: home)
    }

    /* ---------- tabs ---------- */
    private fun resolve(input: String): String {
        val s = input.trim()
        if (s.isEmpty()) return home
        if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(s)) return s
        if (!s.contains(' ') && Regex("^([\\w-]+(\\.[\\w-]+)+|localhost)(:\\d+)?([/?#].*)?$").matches(s)) return "https://$s"
        return "https://www.google.com/search?q=" + URLEncoder.encode(s, "UTF-8")
    }

    private fun go(input: String) {
        tabs.getOrNull(cur)?.loadUrl(resolve(input))
        address.clearFocus()
    }

    private fun newTab(url: String?) {
        val wv = WebView(this)
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(true)
            allowFileAccess = false
            allowContentAccess = false
            builtInZoomControls = true
            displayZoomControls = false
            userAgentString = userAgentString.replace("; wv", "")
        }
        wv.setBackgroundColor(bg)
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val s = r.url.scheme
                return s != "http" && s != "https"
            }
            override fun onPageFinished(v: WebView, u: String) {
                if (v === tabs.getOrNull(cur) && !address.hasFocus()) address.setText(u)
            }
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(v: WebView, title: String) { v.tag = title }
            override fun onCreateWindow(v: WebView, dialog: Boolean, gesture: Boolean, msg: Message): Boolean {
                newTab(null)
                (msg.obj as WebView.WebViewTransport).webView = tabs[cur]
                msg.sendToTarget()
                return true
            }
        }
        tabs.add(wv)
        select(tabs.size - 1)
        if (url != null) wv.loadUrl(url)
    }

    private fun select(i: Int) {
        cur = i
        holder.removeAllViews()
        holder.addView(tabs[i], FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        address.setText(tabs[i].url ?: "")
        tabBtn.text = tabs.size.toString()
    }

    private fun closeCurrent() {
        val wv = tabs.removeAt(cur)
        holder.removeAllViews()
        wv.destroy()
        if (tabs.isEmpty()) newTab(home) else select(minOf(cur, tabs.size - 1))
    }

    private fun showTabs() {
        val names = Array(tabs.size) { i -> (tabs[i].tag as? String)?.takeIf { it.isNotBlank() } ?: (tabs[i].url ?: "New tab") }
        AlertDialog.Builder(this)
            .setTitle("Tabs")
            .setItems(names) { _, i -> select(i) }
            .setPositiveButton("New tab") { _, _ -> newTab(home) }
            .setNeutralButton("Close current") { _, _ -> closeCurrent() }
            .setNegativeButton("Back", null)
            .show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val wv = tabs.getOrNull(cur)
        when {
            wv != null && wv.canGoBack() -> wv.goBack()
            tabs.size > 1 -> closeCurrent()
            else -> super.onBackPressed()
        }
    }

    /* ---------- bookmarks ---------- */
    private fun marks(): JSONArray = JSONArray(prefs.getString("bookmarks", "[]"))
    private fun saveMarks(a: JSONArray) { prefs.edit().putString("bookmarks", a.toString()).apply() }

    private fun addMark() {
        val wv = tabs.getOrNull(cur) ?: return
        val u = wv.url ?: return
        val a = marks()
        for (i in 0 until a.length()) if (a.getJSONObject(i).optString("url") == u) {
            Toast.makeText(this, "Already bookmarked", Toast.LENGTH_SHORT).show(); return
        }
        val out = JSONArray().put(JSONObject().put("url", u).put("title", (wv.tag as? String) ?: u).put("ts", System.currentTimeMillis()))
        for (i in 0 until a.length()) out.put(a.get(i))
        saveMarks(out)
        Toast.makeText(this, "Bookmarked", Toast.LENGTH_SHORT).show()
    }

    private fun showMarks() {
        val a = marks()
        val names = Array(a.length()) { i -> a.getJSONObject(i).optString("title").ifBlank { a.getJSONObject(i).optString("url") } }
        AlertDialog.Builder(this)
            .setTitle("Bookmarks")
            .setItems(names) { _, i -> newTab(a.getJSONObject(i).getString("url")) }
            .setPositiveButton("Bookmark this page") { _, _ -> addMark() }
            .setNegativeButton("Close", null)
            .show()
    }

    /* ---------- sync ---------- */
    private fun showSync() {
        fun field(hint: String, pwd: Boolean = false) = EditText(this).apply {
            this.hint = hint; setSingleLine()
            if (pwd) inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val server = field("https://sync.example.com").apply { setText(prefs.getString("syncUrl", "")) }
        val user = field("Username").apply { setText(prefs.getString("syncUser", "")) }
        val pass = field("Passphrase", true)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(48, 16, 48, 0)
            addView(server); addView(user); addView(pass)
        }
        AlertDialog.Builder(this)
            .setTitle("Sync bookmarks")
            .setView(box)
            .setPositiveButton("Sync now") { _, _ ->
                val s = server.text.toString().trim(); val u = user.text.toString().trim(); val p = pass.text.toString()
                prefs.edit().putString("syncUrl", s).putString("syncUser", u).apply()
                Thread {
                    try {
                        val merged = Sync.run(s, u, p, marks())
                        runOnUiThread { saveMarks(merged); Toast.makeText(this, "Synced ${merged.length()} bookmarks", Toast.LENGTH_SHORT).show() }
                    } catch (e: Exception) {
                        runOnUiThread { Toast.makeText(this, e.message ?: "Sync failed", Toast.LENGTH_LONG).show() }
                    }
                }.start()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}

/** Same crypto and blob format as the desktop app (see src/sync.js). */
object Sync {
    private fun derive(user: String, pass: String): Pair<ByteArray, String> {
        val f = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val k = f.generateSecret(PBEKeySpec(pass.toCharArray(), "rift:$user".toByteArray(), 200000, 512)).encoded
        val tok = MessageDigest.getInstance("SHA-256").digest(k.copyOfRange(32, 64)).joinToString("") { "%02x".format(it) }
        return Pair(k.copyOfRange(0, 32), tok)
    }

    private fun enc(key: ByteArray, text: String): String {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        return Base64.getEncoder().encodeToString(iv + c.doFinal(text.toByteArray()))
    }

    private fun dec(key: ByteArray, b64: String): String {
        val b = Base64.getDecoder().decode(b64)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b.copyOfRange(0, 12)))
        return String(c.doFinal(b, 12, b.size - 12))
    }

    private fun http(method: String, url: String, token: String, body: String?): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 10000
        c.readTimeout = 15000
        c.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = c.responseCode
        val txt = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        return Pair(code, txt)
    }

    fun run(server: String, user: String, pass: String, local: JSONArray): JSONArray {
        if (!server.startsWith("https://")) throw Exception("Server must use https://")
        if (user.isBlank() || pass.isEmpty()) throw Exception("Enter a username and passphrase")
        val (key, token) = derive(user, pass)
        val url = server.trimEnd('/') + "/v1/blob/" + URLEncoder.encode(user, "UTF-8")

        val (code, body) = http("GET", url, token, null)
        if (code == 401) throw Exception("Wrong passphrase for this account")
        if (code != 200 && code != 404) throw Exception("Server error $code")
        val remote = if (code == 200) JSONObject(dec(key, JSONObject(body).getString("blob"))) else JSONObject()

        val map = LinkedHashMap<String, JSONObject>()
        for (arr in listOf(remote.optJSONArray("bookmarks") ?: JSONArray(), local)) {
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                val k = o.getString("url")
                val old = map[k]
                if (old == null || o.optLong("ts") > old.optLong("ts")) map[k] = o
            }
        }
        val merged = JSONArray(map.values.sortedByDescending { it.optLong("ts") })
        remote.put("bookmarks", merged)

        val (pc, _) = http("PUT", url, token, JSONObject().put("blob", enc(key, remote.toString())).toString())
        if (pc !in 200..299) throw Exception("Push failed ($pc)")
        return merged
    }
}
