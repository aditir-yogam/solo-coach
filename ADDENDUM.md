# Epic 1 addendum: set password + return login

This change touches only the email sign-up path. Google/LinkedIn sign-in, Page 2, story generation and the Portfolio work exactly as before.

## What changed

The emailed link is now used exactly once, to prove the coach owns the address. Clicking it marks the token used but leaves the coach `pending`, and opens the Set your password screen instead of Page 2. The coach types a password twice; if the two don't match, the screen says so and nothing is sent. When they match, the password is hashed with scrypt and stored in `dev_local_credentials`, and only then does the coach become `active` and continue to Page 2.

Returning email coaches use the new Login screen at `/login`: email, password, Log in, the same Google and LinkedIn buttons as Page 1, a "New here? Sign up" link, and a "Forgot password?" link that is a visible stub on purpose. A correct login goes straight to the Portfolio. A wrong one shows "Email or password is incorrect." on the Login screen itself.

One email is one account. Signing up on Page 1 with an email that is already registered is refused with an inline message: a "Log in" link for an active account, or a "Resend link" button for an account that hasn't been verified yet.

## The dev-only table

`init.sql` gains one table, `dev_local_credentials (coach_id, password_hash, created_at)`. It exists only so the flow can be tested locally; in production Cognito owns passwords. All access to it lives in `backend/app/dev_credentials.py`, separate from `repositories.py`, and the `coaches` table never holds password data. Because `init.sql` only runs on a fresh database, run `./scripts/reset.sh` once after pulling this change.

## Endpoints

| Method and path | What it does |
|---|---|
| `GET /verify?token=...` | Marks the token used, keeps the coach pending, opens `/set-password` |
| `GET /api/v1/auth/password-setup` | The email being set up (the Set password screen uses it) |
| `POST /api/v1/auth/set-password` | `{password, confirm_password}`: saves the hash, activates the coach, signs them in |
| `POST /api/v1/auth/login` | `{email, password}`: signs in and returns `/portfolio`, or 401 with the plain message |

The password step is protected by a short-lived signed cookie set by `/verify`, valid for 30 minutes. It only allows setting the password for that one coach.

## Decisions to confirm

The Set password and Login wireframes weren't available yet, so both screens follow the Page 1 design and their wording may change once they arrive. Passwords need at least 8 characters. The Page 1 helper line "No password needed" was no longer true, so it now reads "We'll email you a link to confirm your address, then you'll set a password."

## Tests

`cd acceptance && npm test` now runs the original 17 scenarios, tenancy, the one-email-one-account check (D) and the addendum's seven scenarios (A1 to A7): 26 checks in total.
