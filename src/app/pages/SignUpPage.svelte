<script>
	import {
		CalendarDays,
		Building,
		CheckCircle2,
		Clock3,
		Eye,
		EyeOff,
		GraduationCap,
		KeyRound,
		Loader2,
		LockKeyhole,
		Mail,
		School,
		Shield,
		User,
	} from "lucide-svelte";
	import heroImage from "../../assets/hero.png";
	import {
		registerAccount,
		resendEmailOtp,
		verifyEmailOtp,
	} from "../lib/auth.js";

	let name = "";
	let email = "";
	let password = "";
	let confirmPassword = "";
	let showPassword = false;
	let showConfirmPassword = false;
	let role = "Student";
	let error = "";
	let info = "";
	let stage = "account";

	let totalHours = "";
	let startDate = "";
	let department = "";
	let course = "";
	let school = "";
	let showCourseSuggestions = false;
	let showSchoolSuggestions = false;
	let otpCode = "";
	let verificationEmail = "";
	let isVerifyingOtp = false;
	let isResendingOtp = false;
	let isSubmittingAccount = false;
	let isSubmittingSignup = false;

	const courseCatalog = [
		"BS Accountancy",
		"BS Architecture",
		"BS Biology",
		"BS Business Administration",
		"BS Civil Engineering",
		"BS Chemical Engineering",
		"BS Computer Engineering",
		"BS Communication",
		"BS Computer Engineering",
		"BS Computer Science",
		"BS Criminology",
		"BS Electrical Engineering",
		"BS Electronics Engineering",
		"BS Elementary Education",
		"BS Hospitality Management",
		"BS Industrial Engineering",
		"BS Information Systems",
		"BS Information Technology",
		"BS Mechanical Engineering",
		"BS Medical Technology",
		"BS Nursing",
		"BS Pharmacy",
		"BS Psychology",
		"BS Secondary Education",
		"BS Tourism Management",
	];

	const schoolCatalog = [
		"Assumption College",
		"Ateneo de Davao University",
		"Ateneo de Manila University",
		"Brokenshire College",
		"Cebu Institute of Technology University",
		"Davao Doctors College",
		"De La Salle University",
		"Holy Cross of Davao College",
		"Jose Maria College",
		"Mapua University",
		"Mapua Malayan Colleges Mindanao",
		"Mindanao State University",
		"MSU - Iligan Institute of Technology",
		"Notre Dame of Dadiangas University",
		"Philippine College of Technology",
		"Polytechnic University of the Philippines",
		"San Pedro College",
		"Silliman University",
		"St. John Paul II College of Davao",
		"University of Immaculate Conception",
		"University of Mindanao",
		"University of Mindanao - Tagum College",
		"University of Mindanao - Digos Campus",
		"University of San Carlos",
		"University of Santo Tomas",
		"University of Southeastern Philippines",
		"University of the Philippines",
	];

	const departmentCatalog = ["ISOC", "RSC", "CNFM"];

	function isValidEmail(value) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
	}

	function goBackToLogin() {
		window.location.hash = "/login";
	}

	function setVerificationStage(emailInput) {
		verificationEmail = String(emailInput || email || "")
			.trim()
			.toLowerCase();
		otpCode = "";
		error = "";
		info = `A 6-digit OTP has been sent to ${verificationEmail}.`;
		stage = "verify";
	}

	async function submitAccount() {
		error = "";
		info = "";

		if (!name || !email || !password || !confirmPassword || !role) {
			error = "Please complete name, email, password, and role.";
			return;
		}

		if (!isValidEmail(email)) {
			error = "Please provide a valid email address.";
			return;
		}

		if (password.length < 8) {
			error = "Password must be at least 8 characters long.";
			return;
		}

		if (password !== confirmPassword) {
			error = "Password and confirm password do not match.";
			return;
		}

		if (role === "Supervisor") {
			try {
				isSubmittingAccount = true;
				const registration = await registerAccount({
					name,
					email,
					password,
					role,
				});
				setVerificationStage(registration?.verification_email || email);
			} catch (err) {
				error = err?.message || "Unable to create account right now.";
			} finally {
				isSubmittingAccount = false;
			}
			return;
		}

		stage = "ojt";
		info = "Great. Complete OJT setup to finish your Intern signup.";
	}

	async function submitStudentSignup() {
		error = "";
		info = "";

		if (!totalHours || !startDate || !department || !course || !school) {
			error = "Please complete all OJT setup details.";
			return;
		}

		if (Number(totalHours) <= 0) {
			error = "Total OJT hours must be greater than zero.";
			return;
		}

		const totalWorkingDays = Math.ceil(Number(totalHours) / 8);
		const computedEstimatedEndDateObj = addWorkingDays(
			startDate,
			Math.max(0, totalWorkingDays - 1),
		);
		const computedEstimatedEndDate = toIsoDateOnly(
			computedEstimatedEndDateObj,
		);

		if (!computedEstimatedEndDate) {
			error = "Invalid start date. Please select a valid date.";
			return;
		}

		try {
			isSubmittingSignup = true;
			const registration = await registerAccount({
				name,
				email,
				password,
				role,
				department,
				ojtProfile: {
					total_ojt_hours: Number(totalHours),
					start_date: startDate,
					estimated_end_date: computedEstimatedEndDate,
					course,
					school,
				},
			});

			setVerificationStage(registration?.verification_email || email);
		} catch (err) {
			error = err?.message || "Unable to create account right now.";
		} finally {
			isSubmittingSignup = false;
		}
	}

	async function submitOtpVerification() {
		error = "";

		if (!verificationEmail) {
			error =
				"Missing verification email. Please restart account signup.";
			return;
		}

		if (!/^\d{6}$/.test(otpCode.trim())) {
			error = "Enter a valid 6-digit OTP code.";
			return;
		}

		try {
			isVerifyingOtp = true;
			await verifyEmailOtp(verificationEmail, otpCode.trim());
			stage = "success";
			info = "Your email is verified. You can now log in.";
		} catch (err) {
			error = err?.message || "Unable to verify OTP right now.";
		} finally {
			isVerifyingOtp = false;
		}
	}

	async function resendOtpCode() {
		error = "";

		if (!verificationEmail) {
			error =
				"Missing verification email. Please restart account signup.";
			return;
		}

		try {
			isResendingOtp = true;
			const result = await resendEmailOtp(verificationEmail);
			info =
				result?.message ||
				`A new OTP has been sent to ${verificationEmail}.`;
		} catch (err) {
			error = err?.message || "Unable to resend OTP right now.";
		} finally {
			isResendingOtp = false;
		}
	}

	function backToAccountStep() {
		stage = "account";
		error = "";
		info = "";
	}

	function filterSuggestions(options, query) {
		const term = query.trim().toLowerCase();

		if (!term) {
			return [];
		}

		return options
			.filter((option) => option.toLowerCase().includes(term))
			.slice(0, 8);
	}

	function parseIsoDateOnly(value) {
		const raw = String(value || "").trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
			return null;
		}

		const [y, m, d] = raw.split("-").map((n) => Number(n));
		const dt = new Date(y, m - 1, d);
		if (Number.isNaN(dt.getTime())) {
			return null;
		}

		return dt;
	}

	function addWorkingDays(startDateValue, workingDays) {
		const start =
			startDateValue instanceof Date
				? new Date(startDateValue)
				: parseIsoDateOnly(startDateValue);
		if (!start || Number.isNaN(start.getTime())) return null;

		let remaining = Math.max(0, Math.trunc(Number(workingDays || 0)));
		const cursor = new Date(start);

		while (cursor.getDay() === 0 || cursor.getDay() === 6) {
			cursor.setDate(cursor.getDate() + 1);
		}

		while (remaining > 0) {
			cursor.setDate(cursor.getDate() + 1);
			if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
				remaining -= 1;
			}
		}

		return cursor;
	}

	function toIsoDateOnly(dateInput) {
		if (!(dateInput instanceof Date) || Number.isNaN(dateInput.getTime())) {
			return "";
		}

		const year = dateInput.getFullYear();
		const month = String(dateInput.getMonth() + 1).padStart(2, "0");
		const day = String(dateInput.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function selectCourse(value) {
		course = value;
		showCourseSuggestions = false;
	}

	function selectSchool(value) {
		school = value;
		showSchoolSuggestions = false;
	}

	function hideCourseSuggestions() {
		setTimeout(() => {
			showCourseSuggestions = false;
		}, 100);
	}

	function hideSchoolSuggestions() {
		setTimeout(() => {
			showSchoolSuggestions = false;
		}, 100);
	}

	$: filteredCourses = filterSuggestions(courseCatalog, course);
	$: filteredSchools = filterSuggestions(schoolCatalog, school);
</script>

<section class="signup-shell" style={`--bg-image: url(${heroImage});`}>
	<div class="signup-layout">
		<section class="brand-panel">
			<h1>Internship Management System</h1>
			<p>
				Create trusted access for students and supervisors in a
				telecom-grade internship environment.
			</p>
			<div class="phase-pills" aria-hidden="true">
				<span class:active={stage === "account"}>Account</span>
				<span class:active={stage === "ojt"}>OJT Setup</span>
				<span class:active={stage === "verify"}>Verify Email</span>
				<span class:active={stage === "success"}>Ready</span>
			</div>
		</section>

		<div class="signup-card">
			<header class="signup-head">
				<h1>Create Account</h1>
				<p>
					{stage === "ojt"
						? "Complete your required OJT profile to finalize registration."
						: stage === "verify"
							? "Verify your email with the OTP code before logging in."
							: "Set up your account and continue to your internship dashboard."}
				</p>
			</header>

			{#if stage === "account"}
				<form
					class="signup-form"
					on:submit|preventDefault={submitAccount}
				>
					<label class="field">
						<span>Name</span>
						<div class="input-wrap">
							<span class="input-icon"
								><User size={16} strokeWidth={2.2} /></span
							>
							<input
								bind:value={name}
								type="text"
								placeholder="Enter your full name"
								autocomplete="name"
							/>
						</div>
					</label>

					<label class="field">
						<span>Email</span>
						<div class="input-wrap">
							<span class="input-icon"
								><Mail size={16} strokeWidth={2.2} /></span
							>
							<input
								bind:value={email}
								type="email"
								autocomplete="email"
								placeholder="Enter your email address"
							/>
						</div>
					</label>

					<label class="field">
						<span>Password</span>
						<div class="input-wrap password-wrap">
							<span class="input-icon"
								><LockKeyhole
									size={16}
									strokeWidth={2.2}
								/></span
							>
							<input
								bind:value={password}
								type={showPassword ? "text" : "password"}
								autocomplete="new-password"
								placeholder="Create password"
							/>
							<button
								type="button"
								class="toggle-password"
								on:click={() => (showPassword = !showPassword)}
								aria-label={showPassword
									? "Hide password"
									: "Show password"}
							>
								{#if showPassword}
									<EyeOff size={16} />
								{:else}
									<Eye size={16} />
								{/if}
							</button>
						</div>
					</label>

					<label class="field">
						<span>Confirm Password</span>
						<div class="input-wrap password-wrap">
							<span class="input-icon"
								><LockKeyhole
									size={16}
									strokeWidth={2.2}
								/></span
							>
							<input
								bind:value={confirmPassword}
								type={showConfirmPassword ? "text" : "password"}
								autocomplete="new-password"
								placeholder="Confirm password"
							/>
							<button
								type="button"
								class="toggle-password"
								on:click={() =>
									(showConfirmPassword =
										!showConfirmPassword)}
								aria-label={showConfirmPassword
									? "Hide password"
									: "Show password"}
							>
								{#if showConfirmPassword}
									<EyeOff size={16} />
								{:else}
									<Eye size={16} />
								{/if}
							</button>
						</div>
					</label>

					<label class="field">
						<span>Role</span>
						<div class="input-wrap select-wrap">
							<span class="input-icon"
								><Shield size={16} strokeWidth={2.2} /></span
							>
							<select bind:value={role}>
								<option value="Supervisor">Supervisor</option>
								<option value="Student">Intern</option>
							</select>
						</div>
					</label>

					{#if error}
						<p class="feedback error">{error}</p>
					{/if}

					{#if info}
						<p class="feedback success">{info}</p>
					{/if}

					<div class="actions">
						<button
							class="primary"
							type="submit"
							disabled={isSubmittingAccount}
						>
							{#if isSubmittingAccount}
								<span class="spinning-icon"
									><Loader2 size={18} /></span
								>
								<span>Processing...</span>
							{:else}
								<span>Continue</span>
							{/if}
						</button>
						<button
							class="secondary"
							type="button"
							on:click={goBackToLogin}
							disabled={isSubmittingAccount}>Back to Login</button
						>
					</div>
				</form>
			{/if}

			{#if stage === "ojt"}
				<form
					class="signup-form"
					on:submit|preventDefault={submitStudentSignup}
				>
					{#if info}
						<p class="feedback success">{info}</p>
					{/if}

					<label class="field">
						<span>Total OJT Hours</span>
						<div class="input-wrap">
							<span class="input-icon"
								><Clock3 size={16} strokeWidth={2.2} /></span
							>
							<input
								bind:value={totalHours}
								type="number"
								min="1"
							/>
						</div>
					</label>

					<label class="field">
						<span>Start Date</span>
						<div class="input-wrap">
							<span class="input-icon"
								><CalendarDays
									size={16}
									strokeWidth={2.2}
								/></span
							>
							<input bind:value={startDate} type="date" />
						</div>
					</label>

					<label class="field">
						<span>Department</span>
						<div class="input-wrap">
							<span class="input-icon"
								><Building size={16} strokeWidth={2.2} /></span
							>
							<select bind:value={department}>
								<option value="" disabled selected
									>Select Department</option
								>
								{#each departmentCatalog as item}
									<option value={item}>{item}</option>
								{/each}
							</select>
						</div>
					</label>

					<label class="field">
						<span>Course</span>
						<div class="typeahead-wrap">
							<div class="input-wrap">
								<span class="input-icon"
									><GraduationCap
										size={16}
										strokeWidth={2.2}
									/></span
								>
								<input
									bind:value={course}
									autocomplete="off"
									on:focus={() =>
										(showCourseSuggestions = true)}
									on:blur={hideCourseSuggestions}
									placeholder="Search your course"
								/>
							</div>

							{#if showCourseSuggestions && course.trim().length > 0 && filteredCourses.length > 0}
								<ul
									class="suggestions"
									role="listbox"
									aria-label="Course suggestions"
								>
									{#each filteredCourses as item}
										<li>
											<button
												type="button"
												class="suggestion-item"
												on:mousedown={() =>
													selectCourse(item)}
											>
												{item}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</label>

					<label class="field">
						<span>School</span>
						<div class="typeahead-wrap">
							<div class="input-wrap">
								<span class="input-icon"
									><School
										size={16}
										strokeWidth={2.2}
									/></span
								>
								<input
									bind:value={school}
									type="text"
									autocomplete="off"
									on:focus={() =>
										(showSchoolSuggestions = true)}
									on:blur={hideSchoolSuggestions}
									placeholder="Search your school"
								/>
							</div>

							{#if showSchoolSuggestions && school.trim().length > 0 && filteredSchools.length > 0}
								<ul
									class="suggestions"
									role="listbox"
									aria-label="School suggestions"
								>
									{#each filteredSchools as item}
										<li>
											<button
												type="button"
												class="suggestion-item"
												on:mousedown={() =>
													selectSchool(item)}
											>
												{item}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</label>

					{#if error}
						<p class="feedback error">{error}</p>
					{/if}

					<div class="actions">
						<button
							class="primary"
							type="submit"
							disabled={isSubmittingSignup}
						>
							{#if isSubmittingSignup}
								<span class="spinning-icon"
									><Loader2 size={18} /></span
								>
								<span>Processing...</span>
							{:else}
								<span>Complete Signup</span>
							{/if}
						</button>
						<button
							class="secondary"
							type="button"
							on:click={goBackToLogin}
							disabled={isSubmittingSignup}>Back to Login</button
						>
						<button
							class="text-btn"
							type="button"
							on:click={backToAccountStep}
							disabled={isSubmittingSignup}
							>Back to Account Details</button
						>
					</div>
				</form>
			{/if}

			{#if stage === "verify"}
				<form
					class="signup-form"
					on:submit|preventDefault={submitOtpVerification}
				>
					<p class="verify-help">
						Enter the 6-digit code sent to <strong
							>{verificationEmail}</strong
						>.
					</p>

					<label class="field">
						<span>OTP Code</span>
						<div class="input-wrap">
							<span class="input-icon"
								><KeyRound size={16} strokeWidth={2.2} /></span
							>
							<input
								bind:value={otpCode}
								type="text"
								inputmode="numeric"
								maxlength="6"
								placeholder="Enter 6-digit OTP"
							/>
						</div>
					</label>

					{#if error}
						<p class="feedback error">{error}</p>
					{/if}

					{#if info}
						<p class="feedback success">{info}</p>
					{/if}

					<div class="actions">
						<button
							class="primary"
							type="submit"
							disabled={isVerifyingOtp}
						>
							{#if isVerifyingOtp}
								<span class="spinning-icon"
									><Loader2 size={18} /></span
								>
								<span>Verifying...</span>
							{:else}
								<span>Verify OTP</span>
							{/if}
						</button>
						<button
							class="secondary"
							type="button"
							on:click={resendOtpCode}
							disabled={isResendingOtp || isVerifyingOtp}
						>
							{#if isResendingOtp}
								<span class="spinning-icon"
									><Loader2 size={18} /></span
								>
								<span>Sending...</span>
							{:else}
								<span>Resend OTP</span>
							{/if}
						</button>
						<button
							class="text-btn"
							type="button"
							on:click={goBackToLogin}>Back to Login</button
						>
					</div>
				</form>
			{/if}

			{#if stage === "success"}
				<section class="success-panel">
					<div class="success-icon"><CheckCircle2 size={22} /></div>
					<h2>Account Ready</h2>
					<p>{info}</p>
					<div class="actions">
						<button
							class="primary"
							type="button"
							on:click={goBackToLogin}>Go to Login</button
						>
					</div>
				</section>
			{/if}
		</div>
	</div>
</section>

<style>
	.signup-shell {
		position: relative;
		width: 100%;
		height: 100dvh;
		min-height: 100vh;
		background: #020617;
		isolation: isolate;
		overflow: hidden;
	}

	.signup-shell::before {
		content: "";
		position: absolute;
		inset: -1.2rem;
		background-image: var(--bg-image);
		background-size: cover;
		background-position: center;
		filter: blur(9px) saturate(1.1);
		transform: scale(1.06);
		z-index: -3;
	}

	.signup-shell::after {
		content: "";
		position: absolute;
		inset: 0;
		background: radial-gradient(
				circle at 70% 44%,
				rgba(76, 124, 255, 0.25) 0%,
				rgba(76, 124, 255, 0) 48%
			),
			linear-gradient(
				105deg,
				rgba(4, 10, 28, 0.84) 18%,
				rgba(5, 14, 38, 0.7) 56%,
				rgba(7, 13, 34, 0.87) 100%
			);
		z-index: -2;
	}

	.signup-layout {
		width: min(1240px, 100%);
		box-sizing: border-box;
		min-height: 100vh;
		margin: 0 auto;
		padding: clamp(1rem, 3.8vw, 3.5rem);
		display: grid;
		grid-template-columns: minmax(250px, 1fr) minmax(320px, 560px);
		align-items: center;
		gap: clamp(1.4rem, 4vw, 3.4rem);
	}

	.brand-panel {
		max-width: 540px;
		color: #e2e8f0;
		padding-inline: clamp(0rem, 2vw, 1.4rem);
	}

	.brand-panel h1 {
		margin: 0.75rem 0 0;
		font-size: clamp(2rem, 4.7vw, 3.2rem);
		line-height: 1.08;
		letter-spacing: -0.02em;
		color: #f8fafc;
	}

	.brand-panel p {
		margin: 1rem 0 0;
		line-height: 1.65;
		color: rgba(226, 232, 240, 0.9);
		max-width: 43ch;
	}

	.phase-pills {
		margin-top: 1.2rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.phase-pills span {
		padding: 0.36rem 0.62rem;
		border-radius: 999px;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		background: rgba(15, 23, 42, 0.38);
		border: 1px solid rgba(203, 213, 225, 0.26);
		color: #cbd5e1;
	}

	.phase-pills span.active {
		background: linear-gradient(
			95deg,
			rgba(0, 87, 255, 0.55),
			rgba(124, 58, 237, 0.48)
		);
		border-color: rgba(147, 197, 253, 0.7);
		color: #f8fafc;
	}

	.signup-card {
		position: relative;
		padding: clamp(1.1rem, 2.5vw, 1.8rem);
		border-radius: 1.35rem;
		background: linear-gradient(
			150deg,
			rgba(255, 255, 255, 0.18) 0%,
			rgba(233, 239, 255, 0.08) 100%
		);
		border: 1px solid rgba(226, 232, 240, 0.4);
		backdrop-filter: blur(16px);
		box-shadow:
			0 22px 50px -28px rgba(11, 22, 66, 0.9),
			0 0 0 1px rgba(255, 255, 255, 0.08) inset;
	}

	.signup-head {
		margin-bottom: 0.85rem;
	}

	.signup-head h1 {
		margin: 0.22rem 0 0;
		font-size: 1.58rem;
		line-height: 1.2;
		color: #f8fafc;
	}

	.signup-head p {
		margin: 0.34rem 0 0;
		font-size: 0.92rem;
		color: #cbd5e1;
	}

	.signup-form {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.38rem;
	}

	.field span {
		font-size: 0.83rem;
		font-weight: 600;
		color: #e2e8f0;
	}

	.input-wrap {
		position: relative;
	}

	.input-icon {
		position: absolute;
		left: 0.76rem;
		top: 50%;
		transform: translateY(-50%);
		color: #cbd5e1;
		pointer-events: none;
	}

	input,
	select {
		width: 100%;
		height: 2.75rem;
		border-radius: 0.82rem;
		border: 1px solid rgba(203, 213, 225, 0.36);
		background: rgba(15, 23, 42, 0.5);
		color: #f8fafc;
		padding: 0.66rem 0.9rem 0.66rem 2.45rem;
		font-size: 0.94rem;
		outline: none;
		transition:
			border-color 160ms ease,
			box-shadow 180ms ease,
			background-color 160ms ease;
	}

	input::placeholder {
		color: #94a3b8;
	}

	input:focus,
	select:focus {
		border-color: rgba(129, 140, 248, 0.84);
		box-shadow:
			0 0 0 3px rgba(79, 70, 229, 0.28),
			0 10px 20px -16px rgba(76, 124, 255, 0.62);
		background: rgba(15, 23, 42, 0.7);
	}

	.select-wrap select {
		appearance: none;
	}

	.password-wrap input {
		padding-right: 2.72rem;
	}

	.toggle-password {
		position: absolute;
		right: 0.52rem;
		top: 50%;
		transform: translateY(-50%);
		width: 2rem;
		height: 2rem;
		border-radius: 0.6rem;
		border: 0;
		background: transparent;
		color: #cbd5e1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background-color 160ms ease,
			color 160ms ease;
	}

	.toggle-password:hover {
		background: rgba(148, 163, 184, 0.18);
		color: #f8fafc;
	}

	.typeahead-wrap {
		position: relative;
	}

	.suggestions {
		position: absolute;
		top: calc(100% + 0.34rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.35rem;
		list-style: none;
		background: rgba(15, 23, 42, 0.96);
		border: 1px solid rgba(148, 163, 184, 0.48);
		border-radius: 0.8rem;
		box-shadow: 0 20px 35px -28px rgba(2, 6, 23, 0.82);
		max-height: 210px;
		overflow-y: auto;
		z-index: 20;
	}

	.suggestion-item {
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		color: #e2e8f0;
		padding: 0.55rem 0.65rem;
		border-radius: 0.58rem;
		cursor: pointer;
		font-size: 0.86rem;
	}

	.suggestion-item:hover {
		background: rgba(79, 70, 229, 0.34);
		color: #f8fafc;
	}

	.actions {
		margin-top: 0.12rem;
		display: flex;
		gap: 0.56rem;
		flex-wrap: wrap;
	}

	.primary,
	.secondary,
	.text-btn {
		border: 0;
		border-radius: 0.82rem;
		padding: 0.72rem 0.94rem;
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			transform 140ms ease,
			box-shadow 160ms ease,
			filter 160ms ease;
	}

	.primary {
		color: #ffffff;
		background: linear-gradient(
			100deg,
			#0057ff 0%,
			#4f46e5 52%,
			#7c3aed 100%
		);
		box-shadow: 0 16px 34px -22px rgba(79, 70, 229, 0.96);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.primary:hover:not(:disabled) {
		transform: translateY(-1px);
		filter: brightness(1.04);
		box-shadow: 0 20px 38px -24px rgba(124, 58, 237, 0.9);
	}

	.primary:active:not(:disabled) {
		transform: translateY(1px) scale(0.997);
	}

	.secondary {
		background: rgba(148, 163, 184, 0.2);
		color: #e2e8f0;
		border: 1px solid rgba(203, 213, 225, 0.34);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.secondary:hover:not(:disabled) {
		background: rgba(148, 163, 184, 0.32);
	}

	button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.spinning-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.text-btn {
		background: transparent;
		color: #cbd5e1;
		padding-inline: 0.15rem;
	}

	.text-btn:hover {
		color: #f8fafc;
		text-shadow: 0 0 12px rgba(99, 102, 241, 0.38);
	}

	.feedback {
		margin: 0;
		padding: 0.62rem 0.74rem;
		border-radius: 0.66rem;
		font-size: 0.84rem;
	}

	.feedback.error {
		border: 1px solid rgba(248, 113, 113, 0.55);
		background: rgba(127, 29, 29, 0.42);
		color: #fecaca;
	}

	.feedback.success {
		border: 1px solid rgba(74, 222, 128, 0.42);
		background: rgba(20, 83, 45, 0.4);
		color: #bbf7d0;
	}

	.verify-help {
		margin: 0;
		font-size: 0.88rem;
		color: #cbd5e1;
	}

	.verify-help strong {
		color: #e2e8f0;
	}

	.success-panel {
		padding-top: 0.4rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.72rem;
	}

	.success-icon {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 999px;
		margin: 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #bbf7d0;
		background: rgba(22, 101, 52, 0.46);
		border: 1px solid rgba(74, 222, 128, 0.5);
	}

	.success-panel h2 {
		margin: 0;
		color: #f8fafc;
		font-size: 1.24rem;
	}

	.success-panel p {
		margin: 0;
		color: #cbd5e1;
	}

	@media (max-width: 980px) {
		.signup-layout {
			grid-template-columns: 1fr;
			justify-items: center;
			gap: 1.2rem;
		}

		.brand-panel {
			text-align: center;
			max-width: 680px;
		}

		.brand-panel p {
			max-width: 100%;
		}

		.signup-card {
			width: min(560px, 100%);
		}
	}

	@media (max-width: 720px) {
		.actions {
			flex-direction: column;
			align-items: stretch;
		}

		.text-btn {
			text-align: left;
		}
	}

	@media (max-width: 640px) {
		.signup-layout {
			padding: 0.9rem;
		}

		.brand-panel {
			display: none;
		}

		.signup-card {
			padding: 1rem;
			width: 100%;
		}
	}
</style>
