# Local Development Setup Guide

This guide assumes you have never configured a web application before. Follow
the steps in order and tick each checkbox as you finish it.

The application will run on your computer, while authentication and the
PostgreSQL database will run in a hosted Supabase project.

## Complete Checklist

- [X] Install Node.js
- [X] Open the project folder in PowerShell
- [X] Install the project packages
- [X] Create a Supabase account
- [X] Create a Supabase project
- [X] Copy the Project URL
- [X] Copy the publishable API key
- [X] Create `.env.local`
- [x] Install or run the Supabase CLI
- [x] Log in to the Supabase CLI
- [x] Link the local folder to the Supabase project
- [x] Run the database migration
- [x] Start the application
- [x] Create and confirm your user account
- [ ] Create the first Organization
- [ ] Create the first Committee
- [ ] Create the first Meeting
- [ ] Create the first Agenda Item

## 0. Install the Required Software

### Install Node.js

Node.js runs the application and includes the `npm` command used throughout
this guide.

- [ ] Go to [nodejs.org](https://nodejs.org/).
- [ ] Download the **LTS** version.
- [ ] Run the installer.
- [ ] Accept the default installer options.
- [ ] Close and reopen PowerShell after installation.

Check that Node.js and npm work:

```powershell
node --version
npm --version
```

Both commands should print a version number. Node.js must be version 20 or
newer.

### Open PowerShell in the Project Folder

The project folder is:

```text
C:\Users\mathi\Documents\AI Board Assistant
```

Open PowerShell and run:

```powershell
cd "C:\Users\mathi\Documents\AI Board Assistant"
```

The quotation marks are important because the folder name contains spaces.

### Install the Project Packages

Run:

```powershell
npm install
```

This downloads Next.js, Supabase, Tailwind, TypeScript, and the other packages
listed in `package.json`.

- [ ] `npm install` finishes without an error.

Warnings about package funding can be ignored. Do not run
`npm audit fix --force`; it may install incompatible package versions.

## 1. Create the Supabase Project

Supabase provides the application's user accounts and PostgreSQL database.

1. Go to [supabase.com](https://supabase.com/).
2. Click **Start your project**.
3. Create an account or sign in.
4. Click **New project**.
5. Choose or create a Supabase organization.
6. Enter a project name, for example:

   ```text
   Committee Memory Development
   ```

7. Create a strong database password.
8. Save the password in a password manager. You may need it when linking the
   Supabase CLI.
9. Choose the region nearest to you.
10. Choose the free plan while developing.
11. Click **Create new project**.
12. Wait until Supabase says the project is ready.

- [ ] The Supabase project dashboard opens successfully.
- [ ] The database password is stored somewhere secure.

## 2. Obtain the Required Keys

This application needs exactly two Supabase values:

1. The **Project URL**
2. A **Publishable key**

The application does **not** currently require a secret key or legacy
`service_role` key.

### Find the Project URL

1. Open your project in the Supabase Dashboard.
2. Click **Connect** near the top of the project page.
3. Find and copy the **Project URL**.

It normally looks similar to:

```text
https://abcdefghijk.supabase.co
```

### Find the Publishable Key

In the same **Connect** dialog, copy the **Publishable key**. It normally starts
with:

```text
sb_publishable_
```

If the Connect dialog does not show it:

1. Open **Project Settings**.
2. Open **API Keys**.
3. Find the **Publishable key** section.
4. Create a publishable key if one does not already exist.
5. Copy the key.

The publishable key is designed for browser applications. Database access is
still protected by the Row Level Security policies in this project.

### Important Security Warning

Do not copy a **Secret key**, legacy `service_role` key, or database password
into this application's public environment variables.

- [ ] Project URL copied.
- [ ] Publishable key copied.
- [ ] No secret key copied into the application.

## 3. Configure `.env.local`

The repository contains `.env.example`, but Next.js reads your real local
values from `.env.local`.

### Create the File

While PowerShell is open in the project folder, run:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Notepad will open the file.

Replace the placeholder values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_real_key_here
```

Although the variable is named `NEXT_PUBLIC_SUPABASE_ANON_KEY` for application
compatibility, paste the modern **publishable key** into it.

Save and close Notepad.

### Verify the File

The filename must be exactly:

```text
.env.local
```

It must not be `.env.local.txt`.

Do not add quotation marks around the values, and do not add spaces around the
equals sign.

- [ ] `.env.local` exists in the project root.
- [ ] The Project URL is correct.
- [ ] The publishable key is correct.
- [ ] `.env.local` has not been shared or committed.

## 4. Run the Database Migration

The migration creates the PostgreSQL tables, relationships, helper functions,
triggers, and Row Level Security policies.

The migration file is:

```text
supabase\migrations\202606110001_phase_one.sql
```

### Check the Supabase CLI

Run:

```powershell
npx supabase --help
```

The first run may ask:

```text
Need to install the following packages...
Ok to proceed? (y)
```

Type `y` and press Enter.

Do not install Supabase globally with `npm install -g supabase`. Supabase
recommends running it through `npx` or installing it as a local development
dependency.

### Log In

Run:

```powershell
npx supabase login
```

Follow the instructions shown in PowerShell. A browser may open so you can
authorize the CLI.

If it asks for a personal access token:

1. Open [Supabase access tokens](https://supabase.com/dashboard/account/tokens).
2. Create a token named `Local development`.
3. Copy it.
4. Paste it into PowerShell.

Treat this token like a password.

### Link the Project

Run:

```powershell
npx supabase link
```

Select the Supabase project you created earlier.

The CLI may request the database password you created in Step 1.

If the project is not listed, find its project reference in the Supabase
Dashboard URL:

```text
https://supabase.com/dashboard/project/PROJECT_REFERENCE
```

Then run:

```powershell
npx supabase link --project-ref PROJECT_REFERENCE
```

Replace `PROJECT_REFERENCE` with the real value.

### Apply the Migration

Run:

```powershell
npx supabase db push
```

The CLI will show the migration it plans to apply. Confirm when asked.

You should see a success message after
`202606110001_phase_one.sql` is applied.

### Verify the Migration

1. Return to the Supabase Dashboard.
2. Open **Table Editor**.
3. Confirm that these tables exist:

   - `profiles`
   - `organizations`
   - `organization_members`
   - `committees`
   - `committee_members`
   - `meetings`
   - `meeting_attendees`
   - `agenda_items`
   - `agenda_item_occurrences`

- [ ] Supabase CLI login completed.
- [ ] The project was linked.
- [ ] `npx supabase db push` completed successfully.
- [ ] The tables appear in Table Editor.

> After using migrations, avoid manually changing the hosted database in the
> SQL Editor or Table Editor. Future schema changes should be added as migration
> files and applied with `npx supabase db push`.

## 5. Start the Application Locally

Run:

```powershell
npm run dev
```

Leave this PowerShell window open. It is running the development server.

You should see an address similar to:

```text
http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your web browser.

To stop the application later, click the PowerShell window and press
`Ctrl+C`.

- [ ] `npm run dev` starts without an error.
- [ ] The application opens at `http://localhost:3000`.

## 6. Create Your User Account

Before creating an Organization, create the user who will own it.

1. On the home page, click **Create an account**.
2. Enter your full name.
3. Enter your email address.
4. Create a password with at least eight characters.
5. Click **Create account**.
6. Check your email inbox.
7. Open the Supabase confirmation email.
8. Click its confirmation link.
9. Return to [http://localhost:3000/login](http://localhost:3000/login).
10. Sign in.

If no email arrives, check the spam folder. You can also inspect the user in
the Supabase Dashboard under **Authentication → Users**.

- [ ] User account created.
- [ ] Email address confirmed.
- [ ] Sign-in succeeds.

## 7. Create the First Organization

After signing in, the application opens the Organizations page.

1. Find the **New organization** form.
2. Enter an organization name, for example:

   ```text
   Riverside Sports Club
   ```

3. Click **Create organization**.

You become the Organization owner automatically.

- [ ] The Organization page opens.
- [ ] The Organization name is shown at the top.

## 8. Create the First Committee

On the Organization page:

1. Find the **New committee** form.
2. Enter a Committee name, for example:

   ```text
   Events Committee
   ```

3. Add an optional description, for example:

   ```text
   Plans club events and coordinates volunteers.
   ```

4. Click **Create committee**.

You become the Committee chair automatically.

- [ ] The Committee Workspace opens.
- [ ] The Committee name is visible.
- [ ] Navigation shows **Committee Dashboard**, **Meetings**, and
  **Agenda Items**.

## 9. Create the First Meeting

Inside the Committee Workspace:

1. Click **Meetings**.
2. Click **New meeting**.
3. Enter a meeting title, for example:

   ```text
   September Planning Meeting
   ```

4. Add an optional description.
5. Select a start date and time.
6. Select an optional end date and time.
7. Enter an optional location.
8. Click **Create meeting**.

The Meeting page will open. Its agenda is initially empty.

- [ ] The Meeting page opens.
- [ ] The title, date, and location are correct.
- [ ] The Agenda section is visible.

## 10. Create the First Agenda Item

Agenda Item is the application's central entity. It is a durable topic that can
appear in more than one Meeting without losing its history.

### Create It from the Meeting

On the Meeting page:

1. Click **Add agenda item**.
2. Enter a title, for example:

   ```text
   Approve autumn volunteer plan
   ```

3. Enter the objective, for example:

   ```text
   Decide how many volunteers are needed and approve recruitment dates.
   ```

4. Add useful background information.
5. Choose a type:

   - **Discussion** for a topic to explore.
   - **Decision** when the Committee must decide something.
   - **Information** for an update.
   - **Follow-up** for an earlier commitment.

6. Optionally choose a target date.
7. Click **Create and schedule**.

The application creates the durable Agenda Item and schedules it into the
Meeting in one operation.

### Verify It

The Agenda Item page should show:

- Its title
- Its objective
- Its status
- Its type
- Its background
- The Meeting under **Historical context**

Return to the Meeting page. The Agenda Item should also appear in the Meeting's
Agenda section.

- [ ] Agenda Item created.
- [ ] Agenda Item is visible in the Meeting agenda.
- [ ] Meeting is visible in the Agenda Item's historical context.

## Daily Development Routine

After the initial setup, you normally need only:

```powershell
cd "C:\Users\mathi\Documents\AI Board Assistant"
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Troubleshooting

### `node` or `npm` Is Not Recognized

Install the Node.js LTS version, then close and reopen PowerShell.

### The Application Says Supabase Environment Variables Are Missing

Check that:

- The file is named `.env.local`.
- It is in the same folder as `package.json`.
- Both variables contain real values.
- You restarted `npm run dev` after changing the file.

### Sign-Up Works but Sign-In Does Not

Confirm your email address using the Supabase email. Check
**Authentication → Users** in the Supabase Dashboard.

### `supabase db push` Cannot Connect

Check that:

- `npx supabase login` completed.
- `npx supabase link` selected the correct project.
- The database password is correct.
- The Supabase project is running and not paused.

### Port 3000 Is Already in Use

Next.js may automatically choose another address such as:

```text
http://localhost:3001
```

Open the exact address shown in PowerShell.

### You Changed `.env.local` but Nothing Happened

Stop the server with `Ctrl+C`, then restart it:

```powershell
npm run dev
```

## Official References

- [Supabase Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)

