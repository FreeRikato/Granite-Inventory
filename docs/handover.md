# Handover to Kirthik

Moves ownership of every account behind the app to Kirthik while Rikato keeps working on it as a developer. Nothing is rebuilt: the same Supabase projects, the same Vercel project and the same repo change owner, so the app keeps its address, data, keys and history.

Who: **K** = Kirthik, **R** = Rikato, **C** = Claude (driving the CLI and APIs from Rikato's machine).

No passwords or keys go in this file.

## Before and after

```
                 BEFORE                                  AFTER
Supabase         Rikato's org: prod + staging            Shop org (owner: shop Gmail): prod + staging
                                                         Rikato: Administrator
Vercel           Rikato's team mirai4 (Hobby)            Shop Gmail's Vercel account (Hobby, $0)
GitHub           FreeRikato/Granite-Inventory, PUBLIC    kirthikgranite/Granite-Inventory, PRIVATE
                                                         FreeRikato: collaborator
Google sign-in   Google Cloud project owned by Rikato    same project, owners: Rikato + shop Gmail,
  permit         (granite-inventory-508308)              publishing status "In production"
App Team list    aravinthanrc@gmail.com (ADMIN)          + Kirthik's personal Gmail (ADMIN)
Address          granite-inventory.vercel.app            unchanged (custom domain before go-live)
```

The **shop Gmail** is a new, free, normal Gmail used only for the shop's accounts (the examples below use `kirthikgranite.ops@gmail.com`). Kirthik owns it through the recovery phone; Rikato knows the password. Kirthik keeps signing in to the app itself with their own personal Gmail.

## When

One call of about 45 minutes with Kirthik, before any real stock is entered. Prod is nearly empty now, so a step that goes wrong costs nothing. Do the steps in order in one sitting: each account depends on the one before it.

## Checklist

### 1. Shop Gmail (K, 5 min)

- [ ] K creates the Gmail on their phone, with K's phone number as the recovery number.
- [ ] K turns on 2-step verification with K's phone.
- [ ] K shares the password with R through a password manager or in person, not over chat.

Verify: R signs in on the laptop and K approves the prompt.

### 2. GitHub (R + K, 10 min)

- [ ] R signs up for GitHub with the shop Gmail, username `kirthikgranite` or similar (free plan). K approves any code sent to the phone.
- [ ] R, as FreeRikato: repo Settings, then General, Danger Zone, **Transfer ownership** to `kirthikgranite`.
- [ ] As `kirthikgranite`: accept the transfer from the email.
- [ ] As `kirthikgranite`: Settings, then General, Danger Zone, **Change visibility** to Private.
- [ ] As `kirthikgranite`: Settings, then Collaborators, **Add people**: `FreeRikato`. R accepts the invite as FreeRikato.
- [ ] C: `git remote set-url origin git@github.com:kirthikgranite/Granite-Inventory.git`, then `git fetch`.

Verify: `git fetch` works as FreeRikato, and the repo page shows Private.

Rollback: `kirthikgranite` transfers the repo back to FreeRikato. GitHub keeps redirecting the old URL in the meantime, so nothing that points at it breaks.

Until step 3 finishes, pushes do not deploy, because Vercel is still connected to the old owner.

### 3. Vercel (R + C, 10 min)

- [ ] R signs up at vercel.com with **Continue with GitHub** as `kirthikgranite` and picks the Hobby plan. Signing up through GitHub links the two accounts, which is what lets Vercel reach the repo.
- [ ] R, in the new account: Account Settings, then Tokens, creates a token that expires in 1 day and hands it to C.
- [ ] C creates a transfer request for project `granite-inventory` from team `mirai4` (`POST /projects/granite-inventory/transfer-request`) and accepts it with the new account's token (`PUT /projects/transfer-request/:code`). The code is valid for 24 hours. There is no downtime: deployments, env vars, the `granite-inventory.vercel.app` and `staging-granite-inventory.vercel.app` addresses, and settings move with the project.
- [ ] R, in the new account: Project, then Settings, Git, **Connect** `kirthikgranite/Granite-Inventory` (install the Vercel GitHub app on `kirthikgranite` when asked). Check that the production branch is `main` and the Root Directory is empty.
- [ ] R deletes the token.

Verify:
- C pushes a no-op commit to `staging` as FreeRikato, and a Preview build starts and goes READY. That proves collaborator commits deploy on Hobby.
- `https://granite-inventory.vercel.app/login` returns 200 with "Continue with Google".
- `https://staging-granite-inventory.vercel.app/login` returns 200.

Rollback: create a transfer request from the new account back to `mirai4` and accept it as Rikato.

### 4. Supabase (R + C, 10 min)

- [ ] R signs up at supabase.com with **Continue with GitHub** as `kirthikgranite`.
- [ ] As the shop account: create organization **Kirthik Granite** on the Free plan.
- [ ] As the shop account: organization Team, **Invite** Rikato's own Supabase login as **Administrator**. R accepts with that login.
- [ ] R, signed in with their own login, for each of `granite-inventory-bom` (prod) and `granite-staging-bom` (staging): Project Settings, then General, **Transfer project** to Kirthik Granite.

The transfer works because Rikato owns the source org and is a member of the target. Neither project has a GitHub integration or log drains, which would block it. Free to Free moves without downtime. The two projects use up the shop org's two free project slots.

Verify:
- C: `supabase projects list` shows both projects under Kirthik Granite, `ACTIVE_HEALTHY`.
- C: `supabase migration list` against staging lists every migration (as Administrator, Rikato keeps `db push`).
- Prod `/login` still returns 200, and the public business view still answers.

Rollback: the shop account (Owner) transfers the projects back to Rikato's org. As Administrator, Rikato cannot move projects out of the shop org, by design.

### 5. Google sign-in permit (R, 5 min)

In console.cloud.google.com, project `granite-inventory-508308`:

- [ ] IAM, then **Grant access**: the shop Gmail, role **Owner**. Accept the invite from the shop Gmail inbox.
- [ ] Google Auth Platform, then Branding: app name **Kirthik Granite**, user support email = the shop Gmail.
- [ ] Audience: if the publishing status says **Testing**, click **Publish app** so it reads **In production**. In Testing, only listed test users can sign in and they are signed out every 7 days. The app only asks for email and profile, so going to production needs no Google review.

Nothing changes in Supabase or the code: the client ID and secret stay the same.

Verify: R signs out of prod and signs back in with Google. The consent screen shows "Kirthik Granite".

### 6. App Team list (R + K, 5 min)

- [ ] R, signed in to prod as Admin: Settings, then Team, adds **Kirthik's personal Gmail** as **Admin**.
- [ ] K opens `https://granite-inventory.vercel.app` on their phone, signs in with that Gmail, and taps through Overview, Yard and Sell.
- [ ] R stays on the list as Admin for support. K can remove R from the same screen at any time.

Yard workers are added later by K as Yard Operators.

### 7. Wrap up (C, 10 min)

- [ ] Update `docs/environments.md`: the new owners, the private repo URL and the shop org.
- [ ] Update Claude's memory notes about Vercel access. The project now lives in the shop account, so CLI and API calls use that scope.
- [ ] R records where the shop Gmail password lives (the password manager entry name, not the password).

## Before go-live

Decided but not part of the call:

1. **Domain.** Buy one, for example `kirthikgranite.in`, with the shop Gmail as owner, paid by K. Then:
   - Vercel: Project, then Settings, Domains, add it and follow the DNS instructions.
   - Supabase prod: Authentication, then URL Configuration. Set the Site URL to the domain and add `https://<domain>/**` to the redirect URLs. Keep the `vercel.app` entries.
   - Google permit, Branding: add the domain as an authorized domain and as the app home page.
   - Verify: sign in through the new domain, then share the catalog link over WhatsApp once.

Open decisions, to revisit before real daily use:

2. **Supabase Pro ($25/month).** On Free, prod pauses after about a week without traffic, and a paused database means the app is down until someone clicks Restore. Pro never pauses and adds daily backups. The upgrade happens in the shop org's billing and needs no migration.
3. **Vercel Pro ($20/month).** Hobby is for non-commercial use under Vercel's terms, and it cannot hold team members. Upgrading the same account to Pro fixes both with no redeploy. Rikato can then join with their own login as Owner (the included seat) and K as Billing (free).

## What stays in Rikato's name

- The FreeRikato GitHub account, as a collaborator only.
- Rikato's Supabase login, as Administrator in the shop org.
- Co-ownership of the Google Cloud project.
- Admin on the app's Team list.

The shop Gmail can revoke each of these on its own: remove the collaborator, remove the org member, remove the IAM grant, remove the Team member.
