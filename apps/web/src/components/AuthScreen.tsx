import { useState } from "react";
import {
	redirectAuthError,
	useSessionStore,
	webAuthnAvailable,
} from "../stores/session";
import { TextInput } from "./controls";
import { Mascot } from "./Mascot";

/**
 * Login / signup screen. Bootstrap mode (zero users) asks for the first
 * account; otherwise signup shows only when the server allows it.
 *
 * Which methods appear is the deployment's decision: a password, a
 * security key, Google, or any combination of them
 * (docs/spec/auth-and-hardening.md). A security key and Google are both
 * alternatives to the password rather than second factors on top of it —
 * signing in with a key needs no email either, because the key itself
 * names the account.
 */
export function AuthScreen() {
	const bootstrap = useSessionStore((state) => state.bootstrap);
	const error = useSessionStore((state) => state.error);
	const busy = useSessionStore((state) => state.busy);
	const login = useSessionStore((state) => state.login);
	const signup = useSessionStore((state) => state.signup);
	const loginWithPasskey = useSessionStore((state) => state.loginWithPasskey);
	const signupWithPasskey = useSessionStore((state) => state.signupWithPasskey);

	const canSignup =
		bootstrap?.bootstrap === true || bootstrap?.allowSignup === true;
	const passwords = bootstrap?.passwordAuthEnabled === true;
	const passkeys = webAuthnAvailable && bootstrap?.passkeysEnabled === true;
	const google = bootstrap?.googleAuthEnabled === true;
	const [mode, setMode] = useState<"login" | "signup">(
		bootstrap?.bootstrap === true ? "signup" : "login",
	);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [emailMissing, setEmailMissing] = useState(false);

	// Signup needs the address the account is created under; the browser's
	// own validation never runs, because this is not the submit button.
	const startPasskeySignup = () => {
		if (email.trim() === "") {
			setEmailMissing(true);
			return;
		}
		setEmailMissing(false);
		void signupWithPasskey(email.trim());
	};

	// Nothing left to offer: a deployment locked to security keys, seen
	// from a browser that cannot use one (WebAuthn needs a secure
	// context, so plain http to anything but localhost has none).
	const noMethod = !passwords && !google && !passkeys;
	// A key signup needs the email field even with no password form on
	// screen; a key sign-in needs nothing typed at all.
	const needsEmail = passwords || (passkeys && mode === "signup" && canSignup);
	// Google is a navigation rather than a fetch, so the whole flow is
	// this one link out to the server's start route.
	const startGoogle = () => {
		window.location.assign("/api/auth/google/start");
	};
	// Switching between "sign in" and "create an account" is only a
	// question when something on this screen asks for a password or an
	// email; Google decides it at Google.
	const switchable = canSignup && (passwords || passkeys);

	const submit = () => {
		if (!passwords) {
			// Enter in the email field, with a key as the only way in.
			if (passkeys && mode === "signup") {
				startPasskeySignup();
			}
			return;
		}
		if (mode === "login") {
			void login(email, password);
		} else {
			void signup(email, password);
		}
	};

	return (
		<div className="dg-auth">
			<form
				className="dg-auth-card"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<h1 className="dg-auth-brand">
					<Mascot size={72} />
					<span className="dg-auth-lockup">
						Data<b>gripe</b>
					</span>
				</h1>
				<p className="dg-auth-subtitle">
					{mode === "signup" && switchable
						? bootstrap?.bootstrap === true
							? "Create the first account"
							: "Create an account"
						: "Sign in"}
				</p>
				{needsEmail && (
					<label className="dg-field">
						<span>Email</span>
						<TextInput
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={(event) => {
								setEmail(event.target.value);
								setEmailMissing(false);
							}}
						/>
					</label>
				)}
				{passwords && (
					<label className="dg-field">
						<span>Password</span>
						<TextInput
							type="password"
							required
							minLength={mode === "signup" ? 12 : 1}
							autoComplete={
								mode === "signup" ? "new-password" : "current-password"
							}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</label>
				)}
				{passwords && mode === "signup" && (
					<p className="dg-modal-hint">At least 12 characters.</p>
				)}
				{emailMissing && (
					<p className="dg-test-failed">
						Enter the email for the new account first.
					</p>
				)}
				{noMethod && (
					<p className="dg-modal-hint">
						{bootstrap?.passkeysEnabled === true
							? "This server signs in with a security key, and this browser cannot use one here — it needs HTTPS, or localhost."
							: "This server has no sign-in method configured. Check the server's configuration."}
					</p>
				)}
				{error !== null && <p className="dg-test-failed">{error}</p>}
				{error === null && redirectAuthError !== null && (
					<p className="dg-test-failed">{redirectAuthError}</p>
				)}
				{passwords && (
					<button type="submit" disabled={busy}>
						{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
					</button>
				)}
				{google && (
					<>
						{passwords && <p className="dg-auth-or">or</p>}
						<button
							type="button"
							className="dg-auth-alternative"
							disabled={busy}
							onClick={startGoogle}
						>
							Continue with Google
						</button>
					</>
				)}
				{passkeys && (mode === "login" || canSignup) && (
					<>
						{(passwords || google) && <p className="dg-auth-or">or</p>}
						<button
							type="button"
							className="dg-auth-alternative"
							disabled={busy}
							onClick={() => {
								if (mode === "login") {
									void loginWithPasskey();
								} else {
									startPasskeySignup();
								}
							}}
						>
							{mode === "login"
								? "Sign in with a security key"
								: "Create account with a security key"}
						</button>
						<p className="dg-modal-hint">
							{mode === "login"
								? "Insert your key and touch it — no password needed."
								: "No password at all. Your key will ask for its PIN."}
						</p>
					</>
				)}
				{switchable && (
					<button
						type="button"
						className="dg-auth-switch"
						onClick={() =>
							setMode((current) => (current === "login" ? "signup" : "login"))
						}
					>
						{mode === "login"
							? "Need an account? Sign up"
							: "Have an account? Sign in"}
					</button>
				)}
			</form>
		</div>
	);
}
