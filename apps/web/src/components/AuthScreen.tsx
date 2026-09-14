import { useState } from "react";
import { useSessionStore, webAuthnAvailable } from "../stores/session";
import { Mascot } from "./Mascot";

/**
 * Login / signup screen. Bootstrap mode (zero users) asks for the first
 * account; otherwise signup shows only when the server allows it.
 *
 * A security key is an alternative to the password, not a second factor
 * on top of it: signing in with one needs no email, because the key
 * itself names the account (docs/spec/auth-and-hardening.md).
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
	const passkeys = webAuthnAvailable && bootstrap?.passkeysEnabled === true;
	const [mode, setMode] = useState<"login" | "signup">(
		bootstrap?.bootstrap === true ? "signup" : "login",
	);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [emailMissing, setEmailMissing] = useState(false);

	const submit = () => {
		if (mode === "login") {
			void login(email, password);
		} else {
			void signup(email, password);
		}
	};

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
					{mode === "signup"
						? bootstrap?.bootstrap === true
							? "Create the first account"
							: "Create an account"
						: "Sign in"}
				</p>
				<label className="dg-field">
					<span>Email</span>
					<input
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
				<label className="dg-field">
					<span>Password</span>
					<input
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
				{mode === "signup" && (
					<p className="dg-modal-hint">At least 12 characters.</p>
				)}
				{emailMissing && (
					<p className="dg-test-failed">
						Enter the email for the new account first.
					</p>
				)}
				{error !== null && <p className="dg-test-failed">{error}</p>}
				<button type="submit" disabled={busy}>
					{busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
				</button>
				{passkeys && (mode === "login" || canSignup) && (
					<>
						<p className="dg-auth-or">or</p>
						<button
							type="button"
							className="dg-auth-passkey"
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
				{canSignup && (
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
