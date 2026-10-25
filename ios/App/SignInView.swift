import SwiftUI
import ReadingCore

struct SignInView: View {
    @Bindable var auth: AccountAuth
    @State private var email = ""
    @State private var password = ""
    private var passwordSetupURL: URL? {
        var local = false
        #if DEBUG
        local = true
        #endif
        return try? NativeAuthServer.normalized(auth.serverAddress, allowLocalhost: local)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("A little space to read.").font(.title2.bold())
                    Text("Sign in with your web account. Your downloaded library stays on this iPhone; web sync is coming next.").foregroundStyle(.secondary)
                }
                Section("Your account") {
                    TextField("Email", text: $email).keyboardType(.emailAddress).textContentType(.username).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("authEmail")
                    SecureField("Password", text: $password).textContentType(.password).accessibilityIdentifier("authPassword")
                    Button(auth.busy ? "Signing in…" : "Sign in") {
                        let submitted = password
                        password = ""
                        Task { await auth.signIn(email: email, password: submitted) }
                    }.disabled(auth.busy || email.isEmpty || password.isEmpty).accessibilityIdentifier("authSignIn")
                }
                if let error = auth.error { Section { Text(error).foregroundStyle(.red).accessibilityIdentifier("authError") } }
                Section {
                    if let base = passwordSetupURL {
                        Link("Set up a password with Discord", destination: base.appendingPathComponent("native/password"))
                    }
                    Text("Sign in with Discord on the website to add or change your password. Use that account’s email here.").font(.footnote).foregroundStyle(.secondary)
                }
                #if DEBUG
                Section {
                    DisclosureGroup("Test server") {
                        TextField("HTTPS origin", text: $auth.serverAddress).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("authServer")
                    }
                }
                #endif
            }.navigationTitle("Paper Drive")
        }
    }
}
